const express = require('express');
const router = express.Router();
const Preference = require('../models/Preference');
const Node = require('../models/Node');
const { askAIForJSON } = require('../utils/ai');   // changed

router.post('/', async (req, res) => {
  try {
    const { name, goal } = req.body;
    if (!name || !goal) {
      return res.status(400).json({ error: 'name and goal are required' });
    }

    const system = `You are helping design a personalized learning path.
Given a topic and the user's goal, generate 2 to 5 short clarifying questions
that would help tailor an explanation and skill breakdown to this specific person.
Ask about things like: their current experience level, what context they'll apply this in,
what they already know, or what's tripping them up.
Respond ONLY with valid JSON, no preamble, no markdown formatting, no code fences.
Format: { "questions": ["...", "..."] }`;

    const prompt = `Topic: ${name}\nGoal: ${goal}`;

    const { questions } = await askAIForJSON({ system, prompt });   // changed

    const node = await Node.create({
      name,
      goal,
      clarifyingQuestions: questions,
      parentId: null,
      rootId: null,
      status: 'awaiting_intake',
    });

    res.status(201).json(node);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});




//////////////////////////////////////////////////////


// small helper: get the single global preference doc, creating a default if none exists
async function getPreference() {
  let pref = await Preference.findOne();
  if (!pref) pref = await Preference.create({});
  return pref;
}

// POST /api/nodes/:id/generate — submit intake answers, generate explanation + sub-nodes
router.post('/:id/generate', async (req, res) => {
  try {
    const { answers } = req.body; // expected: [{ question, answer }, ...]
    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers (array) is required' });
    }

    const node = await Node.findById(req.params.id);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    // caching guard — never regenerate if already done
    if (node.generated) {
      await node.populate('children');
      return res.status(200).json(node);
    }

    node.intakeAnswers = answers;

    const pref = await getPreference();

    const qaText = answers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');

    const system = `You are a personalized learning assistant.
Given a topic, the user's goal, their answers to clarifying questions, and their preferred learning style,
produce: (1) a simple explanation of the topic — only what's necessary to serve their stated goal, no more,
and (2) a breakdown of sub-skills/sub-tasks needed to achieve that goal, ordered roughly from foundational to advanced.
Keep the sub-node list focused — typically 3 to 7 sub-nodes, not an exhaustive list.
Respond ONLY with valid JSON, no preamble, no markdown formatting, no code fences.
Format: { "explanation": "...", "subNodes": ["...", "..."] }`;

    const prompt = `Topic: ${node.name}
Goal: ${node.goal}
Learning style preference: ${pref.learningStyle}

Clarifying Q&A:
${qaText}`;

    const { explanation, subNodes } = await askAIForJSON({ system, prompt });

    // create a Node document for each sub-node (name only — not generated yet)
    const childDocs = await Node.insertMany(
      subNodes.map(name => ({
        name,
        parentId: node._id,
        rootId: node._id, // this node IS the root, since it has no parentId itself
        goal: node.goal,   // inherited for convenience/display, though generation logic will use rootId lookup
        status: 'awaiting_intake', // sub-nodes skip intake, but this just marks "not yet generated"
        generated: false,
      }))
    );

    node.explanation = explanation;
    node.children = childDocs.map(c => c._id);
    node.status = 'ready';
    node.generated = true;
    await node.save();
    
    await node.populate('children');
    res.status(200).json(node);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

///////////////////////////////////////////////////////////////////////
// GET /api/nodes/:id — fetch a node with its children populated
// GET /api/nodes/:id — fetch a node with its children populated
router.get('/:id', async (req, res) => {
  try {
    const node = await Node.findById(req.params.id).populate('children');
    if (!node) return res.status(404).json({ error: 'Node not found' });

    res.status(200).json(node);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid node id format' });
    }
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

////////////////////////////////////////////////////////////
// POST /api/nodes/:id/expand — generate a clicked node's explanation + sub-nodes
router.post('/:id/expand', async (req, res) => {
  try {
    const node = await Node.findById(req.params.id);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    // caching guard — never regenerate if already done
    if (node.generated) {
      await node.populate('children');
      return res.status(200).json(node);
    }

    // root nodes should go through /generate (needs intake answers), not /expand
    if (!node.parentId) {
      return res.status(400).json({ error: 'Root nodes must be generated via /generate, not /expand' });
    }

    // pull root's goal + intake answers (rootId always points to the top-level ancestor)
    const root = await Node.findById(node.rootId);
    if (!root) return res.status(404).json({ error: 'Root node not found' });

    // pull immediate parent's explanation for local context/continuity
    const parent = await Node.findById(node.parentId);
    if (!parent) return res.status(404).json({ error: 'Parent node not found' });

    const pref = await getPreference();

    const qaText = root.intakeAnswers
      .map(a => `Q: ${a.question}\nA: ${a.answer}`)
      .join('\n\n');

    const system = `You are a personalized learning assistant, continuing a skill breakdown that started from a broader topic.
Given the overall goal, the user's answers about their background, the explanation of the parent topic they just came from,
and this specific sub-topic, produce: (1) a simple explanation of THIS sub-topic — only what's necessary to serve
the overall goal, staying consistent with and building on the parent's explanation rather than repeating it, and
(2) a breakdown of further sub-skills/sub-tasks needed for this specific sub-topic, ordered foundational to advanced.
Keep the sub-node list focused — typically 3 to 7 sub-nodes. If this sub-topic is small enough to not need further breakdown,
return an empty subNodes array.
Respond ONLY with valid JSON, no preamble, no markdown formatting, no code fences.
Format: { "explanation": "...", "subNodes": ["...", "..."] }`;

    const prompt = `Overall goal: ${root.goal}
Learning style preference: ${pref.learningStyle}

Overall background Q&A:
${qaText}

Parent topic: ${parent.name}
Parent explanation: ${parent.explanation}

Current sub-topic to explain: ${node.name}`;

    const { explanation, subNodes } = await askAIForJSON({ system, prompt });

    const childDocs = subNodes.length
      ? await Node.insertMany(
          subNodes.map(name => ({
            name,
            parentId: node._id,
            rootId: node.rootId, // pass the SAME root down, not this node
            goal: root.goal,
            status: 'awaiting_intake',
            generated: false,
          }))
        )
      : [];

    node.explanation = explanation;
    node.children = childDocs.map(c => c._id);
    node.status = 'ready';
    node.generated = true;
    await node.save();

    await node.populate('children');
    res.status(200).json(node);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});





module.exports = router;