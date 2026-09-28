import { generalRules } from "../rules/generalRules.js";
import { languageRules } from "../rules/languageRules.js";

export const notesPrompt = (transcript, language = "en") => {
  return `
${generalRules}

${languageRules(language)}

You are creating StudyGenie lecture notes.

The transcript is the ONLY educational source.

Your job is to convert THIS lecture into clear, structured,
student-friendly notes.

==================================================
1. STRICT LECTURE-FIRST RULE
==================================================

Only include topics and subtopics that the teacher actually
explains in the lecture.

Do NOT add:
- Extra facts
- Extra history
- Extra applications
- Extra libraries/tools
- Extra examples
- Extra definitions
- Extra comparisons
- Related concepts not discussed by the teacher
- General textbook knowledge

If the teacher does not discuss something, do not add it.

==================================================
2. COMPLETE ONLY THE TEACHER'S EXPLANATION
==================================================

When the teacher explains a topic in an incomplete, scattered,
or conversational way:

- Organize the explanation properly.
- Combine related statements.
- Remove repetition and filler.
- Correct grammar.
- Complete sentences where needed.
- Preserve the full meaning of what the teacher explained.

Do NOT complete the topic using outside knowledge.

"Complete the explanation" means:
make the teacher's explanation clear and well-structured,
not add new educational content.

==================================================
3. PRESERVE THE TEACHER'S WORDING
==================================================

Use the teacher's natural wording and teaching style whenever
it helps students connect the notes with the lecture.

Preserve:
- Memorable phrases
- Simple explanations
- Analogies
- Examples
- Comparisons
- Teacher-specific ways of explaining difficult concepts
- Important terminology

Do not repeatedly write:
"Teacher said..."
"According to the teacher..."

Instead, naturally integrate the teacher's explanation into
the notes.

Do not rewrite everything into formal textbook language.

The notes should feel like a polished version of what the
student heard in the lecture.

==================================================
4. REMOVE ONLY UNNECESSARY TALK
==================================================

Remove:
- Greetings
- Filler words
- Repetition
- Jokes unrelated to the topic
- Advertisements
- Subscribe/like/share requests
- Unrelated conversation
- Personal discussion unrelated to learning

Do NOT remove:
- Useful examples
- Analogies
- Clarifications
- Comparisons
- Important side explanations
- Teacher tips related to the topic

==================================================
5. DEPTH MUST MATCH THE LECTURE
==================================================

The amount of detail must depend on how much the teacher
actually explains.

If a topic is briefly mentioned:
keep it brief.

If a topic is explained deeply:
preserve that depth.

Do not make a short lecture unnecessarily long.

Do not create extra sections just to make notes look detailed.

==================================================
6. DEFINITIONS
==================================================

If the teacher gives a definition:
rewrite it clearly while preserving its meaning and important wording.

If the teacher explains a concept without a formal definition:
turn that explanation into a simple definition only using
the teacher's information.

Do not add a textbook definition from outside knowledge.

==================================================
7. EXAMPLES
==================================================

Preserve examples given by the teacher.

Do not invent new examples.

If an example is spoken in a messy way, rewrite it clearly
without changing the example.

==================================================
8. FORMULAS / CODE
==================================================

If formulas or code are present:
- Preserve them.
- Fix obvious transcription formatting errors.
- Format them clearly.
- Explain them using only the teacher's explanation.

Do not add formulas or code that were not taught.

==================================================
9. ORGANIZATION
==================================================

Organize the lecture into useful sections such as:

# Main Topic

## Subtopic

Explanation...

### Key Points
- Point
- Point

### Example
Only if teacher gave one.

### Formula
Only if teacher discussed one.

### Code
Only if teacher discussed one.

Only create sections that are actually supported by the lecture.

==================================================
10. FINAL QUALITY CHECK
==================================================

Before returning the notes, internally verify:

- Is every topic actually discussed in the transcript?
- Did I add any outside information?
- Did I preserve the teacher's important wording?
- Did I remove only unnecessary talk?
- Did I organize scattered explanation clearly?
- Are the notes proportional to the lecture?

If any information was not taught in the lecture, remove it.

Return only the final notes in Markdown.

==================================================
LECTURE TRANSCRIPT
==================================================

${transcript}

Now create the final StudyGenie lecture notes.
`;
};
