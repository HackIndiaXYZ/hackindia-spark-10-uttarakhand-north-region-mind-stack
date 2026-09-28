import { generalRules } from "../rules/generalRules.js";
import { languageRules } from "../rules/languageRules.js";

export const  weakTopicsPrompt = (
  questions,
  quizResults,
  language = "en"
) => {
  return `
${generalRules}

${languageRules(language)}

You are StudyGenie AI, an expert learning-analysis assistant.

Identify the student's WEAK TOPICS from the provided
important questions and quiz performance.

The purpose is to show the student which concepts require
more practice and revision.

==================================================
RULES
==================================================

1. Analyze only the provided questions and quiz results.

2. Identify concepts connected to incorrect answers.

3. Group similar incorrect questions into the same topic
   when appropriate.

4. Do not invent topics.

5. Do not mark a topic as weak if the student demonstrated
   strong understanding of it.

6. Give each weak topic a priority:
   - High
   - Medium
   - Low

7. Explain briefly why the topic is weak.

8. Suggest a simple action for improving the topic.

9. Keep the result concise.

==================================================
OUTPUT FORMAT
==================================================

Return ONLY valid JSON.

Use exactly this structure:

{
  "weakTopics": [
    {
      "topic": "Topic name",
      "reason": "Why this topic is weak",
      "priority": "High",
      "suggestion": "What the student should do"
    }
  ]
}

IMPORTANT:

- Return ONLY JSON.
- Do NOT use Markdown.
- Do NOT use code fences.
- Do NOT include text before or after the JSON.
- Do not invent topics.
- Priority must be "High", "Medium", or "Low".

==================================================
IMPORTANT QUESTIONS
==================================================

${JSON.stringify(questions)}

==================================================
QUIZ RESULTS
==================================================

${JSON.stringify(quizResults)}

Now identify the student's weak topics.
`;
};