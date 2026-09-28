export const languageRules = (language) => {

  if (language === "hi") {
    return `
LANGUAGE REQUIREMENT:

Write the response primarily in Hindi using Devanagari script.

IMPORTANT:
ALL explanations, headings, subheadings, descriptions,
bullet points, table content, flowchart labels,
examples, additional information, and keyword meanings
must be written in Hindi.

Technical terms may remain in English when they are commonly
used in their English form.

Examples of terms that may remain in English:

Computer Network
Internet
Router
Switch
Protocol
Database
CPU
RAM
Wi-Fi
Ethernet

Do NOT write complete sentences in English.

Do NOT write headings such as:
"Additional Important Information"
"Main Purpose"
"Network Types"
"Flowchart"

Translate them into Hindi, for example:

"अतिरिक्त महत्वपूर्ण जानकारी"
"मुख्य उद्देश्य"
"नेटवर्क के प्रकार"
"प्रवाह आरेख"

Flowcharts must also follow the selected language.

For example, instead of:

Computer Network
↓
Wired Network
↓
Ethernet Cable

write:

कंप्यूटर नेटवर्क
↓
वायर्ड नेटवर्क
↓
Ethernet Cable

Use English only for technical terms where necessary.

The final response should feel like naturally written
Hindi study material, not English text translated word-by-word.
`;
  }

  if (language === "hinglish") {
    return `
LANGUAGE REQUIREMENT:

Write the response in natural Hinglish.

Use Hindi written in Roman script for explanations,
while keeping commonly used technical terms in English.

Headings, explanations, examples, additional information,
flowcharts, tables, and keyword meanings should follow
natural Hinglish.

Example:

Computer Network ek aisa system hai jisme multiple devices
aapas mein connected hote hain aur data aur resources
share kar sakte hain.

Flowcharts should also use Hinglish:

Computer Network
↓
Wired Network
↓
Ethernet Cable

Do not make the response completely English.

Do not make it formal Hindi.

Keep technical terms such as Computer Network, Router,
Protocol, Database, CPU, RAM, Internet, Wi-Fi and Ethernet
in English where appropriate.

Do NOT use English generic headings such as:

Explanation
Important Points
Examples
Definition
Overview
Key Concepts
Additional Important Information
Important Keywords
Flowchart

Translate them according to the selected language.

For Hindi:

Explanation → व्याख्या
Important Points → महत्वपूर्ण बिंदु
Examples → उदाहरण
Definition → परिभाषा
Overview → अवलोकन
Key Concepts → मुख्य अवधारणाएँ
Additional Important Information → अतिरिक्त महत्वपूर्ण जानकारी
Important Keywords → महत्वपूर्ण शब्दावली
Flowchart → प्रवाह आरेख

`;
  }

  return `
LANGUAGE REQUIREMENT:

Write the entire response in clear English.

Use English for:

- Headings
- Explanations
- Examples
- Tables
- Flowcharts
- Additional information
- Keywords
- Definitions

Do not use Hindi or Hinglish unless it is necessary for
a technical term or directly present in the lecture.
`;
};