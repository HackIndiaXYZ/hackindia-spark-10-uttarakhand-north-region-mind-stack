import { generalRules } from "../rules/generalRules.js";
import { languageRules } from "../rules/languageRules.js";

export const flashcardPrompt = (
  transcript,
  language = "en"
) => {
  return `
${generalRules}

${languageRules(language)}

You are StudyGenie AI, an expert educational flashcard generator.

Create exactly 10 useful study flashcards from the provided
lecture transcript.

The flashcards must represent THIS lecture.

==================================================
FLASHCARD REQUIREMENTS
==================================================

1. Create exactly 10 flashcards.

2. Cover the most important concepts from the lecture.

3. Avoid duplicate or nearly identical flashcards.

4. Questions should test understanding, not only memorization.

5. Include important:
   - Definitions
   - Concepts
   - Examples
   - Comparisons
   - Processes
   - Formulas
   - Technical terms

6. Answers should be concise but complete.

7. Keep each answer student-friendly and easy to revise.

8. Do not ask questions about information not supported
   by the lecture.

==================================================
OUTPUT FORMAT
==================================================

Return ONLY valid JSON.

Use exactly this structure:

[
  {
    "question": "What is a computer network?",
    "answer": "A computer network is a collection of two or more connected devices that communicate and share resources."
  }
]

IMPORTANT:

- Return exactly 10 flashcards.
- Every object must contain "question" and "answer".
- Do NOT use Markdown.
- Do NOT use code fences.
- Do NOT include text before or after the JSON.

==================================================
LECTURE
==================================================

${transcript}

Now generate the flashcards.
`;
};