// utils/ai.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Calls Gemini with a system instruction that forces JSON-only output,
// then safely parses it. Throws if the model doesn't return valid JSON.
async function askAIForJSON({ system, prompt }) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: system,
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const cleaned = text.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('Gemini did not return valid JSON:', text);
    throw new Error('Failed to parse AI response as JSON');
  }
}

module.exports = { askAIForJSON };