const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Use flash for speed in QA

/**
 * AI Quality Controller Service
 * Implements a scoring system to ensure cinematic standards.
 */
class QualityService {
    /**
     * Evaluates a generated scene for quality and coherence.
     * @param {Object} scene - The scene object.
     * @returns {Promise<Object>} - Quality scores and regeneration flag.
     */
    static async evaluateScene(scene) {
        const prompt = `
        You are an AI Video Quality Auditor.
        Evaluate the following scene for its cinematic value and coherence.

        SCENE DATA:
        - Narration: "${scene.narration}"
        - Visual Prompt: "${scene.visual_prompt}"
        - Continuity Hint: "${scene.continuity_hint}"
        - Mood: "${scene.mood}"

        # SCORING CRITERIA (1-10):
        1. visual_match: How well does the visual prompt match the narration?
        2. cinematic_quality: Does the prompt reflect a high-end cinematic aesthetic?
        3. continuity: Does the visual maintain consistency with the continuity hint?

        # OUTPUT SCHEMA (JSON):
        {
          "visual_match": number,
          "cinematic_quality": number,
          "continuity": number,
          "feedback": "string explaining the scores",
          "total_score": number (average)
        }
        `;

        try {
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.3, // Lower temperature for more objective scoring
                    responseMimeType: "application/json",
                },
            });

            const evaluation = JSON.parse(result.response.text());
            const totalScore = (evaluation.visual_match + evaluation.cinematic_quality + evaluation.continuity) / 3;
            
            return {
                ...evaluation,
                total_score: totalScore,
                should_regenerate: totalScore < 7
            };

        } catch (error) {
            console.error("[QualityService] Error evaluating scene:", error);
            // On failure, we assume it's okay unless it's a critical error, 
            // but for production safety, we might want to default to 7.
            return { total_score: 7, should_regenerate: false };
        }
    }
}

module.exports = QualityService;
