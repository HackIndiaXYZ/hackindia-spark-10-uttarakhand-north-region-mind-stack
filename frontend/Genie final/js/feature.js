(async () => {
  const W = StudyWorkspace;
  const type = document.body.dataset.feature;

  const sourceId = new URLSearchParams(location.search).get("sourceId");

  const content = document.getElementById("featureContent");

  const status = document.getElementById("featureStatus");

  const generate = document.getElementById("generateFeature");

  const download = document.getElementById("downloadFeature");

  if (download) {
    download.title = "Choose Save as PDF in the browser print dialog.";
  }

  let snapshot;
  let saved;
  let busy = false;
  let cleanup = () => {};

  content.innerHTML = W.skeleton;
  content.setAttribute("aria-busy", "true");

  const setStatus = (text) => {
    status.textContent = text;
  };

  // =====================================================
  // REFRESH WORKSPACE STATE
  // =====================================================

  async function refreshState() {
    snapshot = await W.state(sourceId);

    document.documentElement.lang =
      snapshot.source.language === "hi"
        ? "hi"
        : snapshot.source.language === "hinglish"
          ? "en-IN"
          : "en";

    document.getElementById("sourceTitle").textContent =
      snapshot.source.title || "Your lecture";

    W.remember(snapshot.source);

    W.navigation(
      document.getElementById("featureNav"),
      sourceId,
      snapshot,
      type,
    );
  }

  // =====================================================
  // READ JSON
  // =====================================================

  function readableJSON(row) {
    if (row.content_json != null) {
      return row.content_json;
    }

    try {
      return JSON.parse(row.content_text);
    } catch {
      return null;
    }
  }

  // =====================================================
  // MIND MAP
  // =====================================================

  function renderMindMap(data) {
    if (!data || !Array.isArray(data.branches || data.children)) {
      throw new Error("This saved mind map has an unsupported format.");
    }

    const branches = data.branches || data.children;

    content.innerHTML = `
      <div class="map-caption">
        <span class="eyebrow">
          THE BIG PICTURE
        </span>

        <span>
          ${branches.length} connected themes
        </span>
      </div>

      <div class="mindmap">

        <svg
          class="map-lines"
          aria-hidden="true">
        </svg>

        <div class="map-root">

          <span>
            ✦ CENTRAL IDEA
          </span>

          <h2>
            ${W.escape(data.central || data.title || "Lecture")}
          </h2>

        </div>

        <div class="map-branches">

          ${branches
            .map(
              (b, i) => `
                <section
                  class="map-branch"
                  style="--branch-hue:${[38, 165, 205, 275, 15, 80][i % 6]}"
                >

                  <div class="branch-heading">

                    <span class="branch-number">
                      ${String(i + 1).padStart(2, "0")}
                    </span>

                    <h3>
                      ${W.escape(b.topic || b.title || "Concept")}
                    </h3>

                  </div>

                  <ul>

                    ${(b.children || [])
                      .map(
                        (c) => `
                          <li>
                            ${W.escape(
                              typeof c === "string"
                                ? c
                                : c.title || c.topic || c.label || "Concept",
                            )}
                          </li>
                        `,
                      )
                      .join("")}

                  </ul>

                </section>
              `,
            )
            .join("")}

        </div>
      </div>
    `;

    const map = content.querySelector(".mindmap");

    const svg = map.querySelector("svg");

    const draw = () => {
      const box = map.getBoundingClientRect();

      const scale = box.width / map.offsetWidth || 1;

      const rect = (el) => {
        const r = el.getBoundingClientRect();

        return {
          left: r.left / scale,
          top: r.top / scale,
          bottom: r.bottom / scale,
          width: r.width / scale,
          height: r.height / scale,
        };
      };

      const outer = rect(map);

      const root = rect(map.querySelector(".map-root"));

      svg.setAttribute("viewBox", `0 0 ${outer.width} ${outer.height}`);

      const x1 = root.left + root.width / 2 - outer.left;

      const y1 = root.bottom - outer.top;

      const earlier = [];

      svg.innerHTML = [...map.querySelectorAll(".map-branch")]
        .map((branch) => {
          const b = rect(branch);

          const x2 = b.left + b.width / 2 - outer.left;

          const y2 = b.top - outer.top;

          const parent = earlier
            .filter((p) => p.bottom < y2 - 8)
            .sort(
              (a, b) =>
                Math.abs(a.x - x2) +
                Math.abs(a.bottom - y2) * 0.15 -
                (Math.abs(b.x - x2) + Math.abs(b.bottom - y2) * 0.15),
            )[0];

          const x = parent ? parent.x : x1;

          const y = parent ? parent.bottom : y1;

          earlier.push({
            x: x2,
            bottom: b.bottom - outer.top,
          });

          return `
            <path
              d="
                M${x},${y}
                C${x},
                ${y + Math.max(12, (y2 - y) / 2)}
                ${x2},
                ${y2 - Math.max(12, (y2 - y) / 2)}
                ${x2},
                ${y2}
              "
            />
          `;
        })
        .join("");
    };

    const observer = new ResizeObserver(draw);

    observer.observe(map);

    draw();

    window.addEventListener("studygenie:print-layout", draw);

    cleanup = () => {
      observer.disconnect();

      window.removeEventListener("studygenie:print-layout", draw);
    };
  }

  // =====================================================
  // FLASHCARDS
  // =====================================================

  function renderFlashcards(data) {
    const cards = Array.isArray(data) ? data : data?.cards;

    if (!cards?.length) {
      throw new Error("No cards found in the saved result.");
    }

    let index = 0;
    let flipped = false;

    content.innerHTML = `
      <div class="recall-meta">
        <span id="cardCount"></span>
        <span>ACTIVE RECALL</span>
      </div>

      <button
        type="button"
        class="recall-card"
        id="recallCard">
      </button>

      <div class="recall-controls">

        <button
          type="button"
          class="secondary-btn"
          id="previousCard">
          ← Previous
        </button>

        <span>
          Tap the card to reveal
        </span>

        <button
          type="button"
          class="secondary-btn"
          id="nextCard">
          Next →
        </button>

      </div>
    `;

    const card = content.querySelector("#recallCard");

    const draw = () => {
      content.querySelector("#cardCount").textContent =
        `Card ${index + 1} of ${cards.length}`;

      card.setAttribute(
        "aria-label",
        flipped
          ? "Answer. Activate to show question."
          : "Question. Activate to reveal answer.",
      );

      card.innerHTML = `
        <span class="eyebrow">
          ${flipped ? "THE ANSWER" : "CAN YOU REMEMBER?"}
        </span>

        <div class="markdown"></div>
      `;

      W.markdown(
        card.querySelector(".markdown"),
        flipped
          ? cards[index].back || cards[index].answer
          : cards[index].front || cards[index].question,
      );
    };

    card.onclick = () => {
      flipped = !flipped;
      draw();
    };

    content.querySelector("#previousCard").onclick = () => {
      index = (index - 1 + cards.length) % cards.length;

      flipped = false;

      draw();
    };

    content.querySelector("#nextCard").onclick = () => {
      index = (index + 1) % cards.length;

      flipped = false;

      draw();
    };

    draw();
  }

  // =====================================================
  // QUIZ
  // =====================================================

  function renderQuiz(data) {
    if (!data?.questions?.length) {
      throw new Error("No saved quiz questions found.");
    }

    if (download) {
      download.hidden = true;
    }

    const answers = Array(data.questions.length).fill(-1);

    content.innerHTML = `
      <form id="quizForm">

        ${data.questions
          .map(
            (q, i) => `
              <fieldset
                class="quiz-question">

                <legend>

                  <span class="eyebrow">
                    QUESTION ${i + 1}
                    /
                    ${data.questions.length}
                  </span>

                  <span>
                    ${W.escape(q.question)}
                  </span>

                </legend>

                ${q.options
                  .map(
                    (o, j) => `
                      <label
                        class="quiz-option">

                        <input
                          type="radio"
                          name="question${i}"
                          value="${j}"
                          required
                        >

                        <span>
                          ${W.escape(o)}
                        </span>

                      </label>
                    `,
                  )
                  .join("")}

              </fieldset>
            `,
          )
          .join("")}

        <button
          class="primary-btn"
          type="submit">
          Finish quiz & see results →
        </button>

      </form>

      <div
        id="quizResult"
        aria-live="polite">
      </div>
    `;

    const form = content.querySelector("form");
    window.StudyUI?.paginate(form);

    form.addEventListener("change", (e) => {
      const i = Number(e.target.name.replace("question", ""));

      answers[i] = Number(e.target.value);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const button = form.querySelector('button[type="submit"]');

      if (button.disabled) {
        return;
      }

      if (answers.some((x) => x < 0)) {
        return setStatus("Answer every question before submitting.");
      }

      button.disabled = true;

      setStatus("Saving your quiz result…");

      try {
        const result = await StudyGenieAPI.request(
          `/api/quizzes/${encodeURIComponent(data.quizId)}/submit`,
          {
            method: "POST",
            body: JSON.stringify({
              answers,
            }),
          },
        );

        form.hidden = true;

        const target = content.querySelector("#quizResult");

        target.innerHTML = `
            <div class="quiz-score">

              <span class="eyebrow">
                QUIZ COMPLETE
              </span>

              <h2>
                ${result.attempt.score}
                /
                ${result.attempt.total}
              </h2>

              <p>
                ${result.attempt.percentage}%
                · Your result is saved
              </p>

              <a
                class="primary-btn"
                href="${W.href("revision", sourceId)}">
                Open Smart Revision →
              </a>

            </div>

            ${result.attempt.answers
              .map(
                (a, i) => `
                  <details
                    class="question-detail">

                    <summary>
                      ${a.isCorrect ? "✓" : "↗"}

                      ${i + 1}.

                      ${W.escape(a.question)}
                    </summary>

                    <p>
                      <b>
                        Correct answer:
                      </b>

                      ${W.escape(a.correctAnswer)}
                    </p>

                    <p>
                      ${W.escape(a.explanation || "")}
                    </p>

                  </details>
                `,
              )
              .join("")}
          `;

        window.StudyUI?.analytics(target, result.attempt);
        window.StudyUI?.notify("Quiz saved. Smart Revision is unlocked.", "success");
        setStatus("Quiz completed. Smart Revision is unlocked.");

        await refreshState();
      } catch (error) {
        setStatus(error.message);

        button.disabled = false;
      }
    });
  }

  // =====================================================
  // SMART REVISION
  // =====================================================

  function renderRevision(data) {
    if (!data || typeof data !== "object") {
      throw new Error("No Smart Revision data found.");
    }

    const performance = data.overallPerformance || {};

    const weakTopics = Array.isArray(data.weakTopics) ? data.weakTopics : [];

    const strongTopics = Array.isArray(data.strongTopics)
      ? data.strongTopics
      : [];

    content.innerHTML = `
      <div class="revision-performance">

        <span class="eyebrow">
          QUIZ PERFORMANCE
        </span>

        <h2>
          ${W.escape(String(performance.score ?? 0))}
          /
          ${W.escape(String(performance.total ?? 0))}
        </h2>

        <p>
          ${W.escape(String(performance.percentage ?? 0))}% score
        </p>

      </div>

      ${
        weakTopics.length
          ? `
            <div
              class="revision-section-title">

              <span class="eyebrow">
                FOCUS HERE FIRST
              </span>

              <h2>
                Weak Topics
              </h2>

              <p>
                Focused lecture explanations based
                on the concepts you answered
                incorrectly.
              </p>

            </div>

            <div
              id="weakTopics" class="revision-topic-list">

              ${weakTopics
                .map((item, index) => {
                  const priority = String(
                    item.priority || "Medium",
                  ).toLowerCase();

                  return `
                      <section
                        class="revision-topic-card">

                        <div
                          class="revision-topic-header">

                          <div>

                            <span
                              class="eyebrow">
                              TOPIC
                              ${String(index + 1).padStart(2, "0")}
                            </span>

                            <h3>
                              ${W.escape(item.topic || "Weak Topic")}
                            </h3>

                          </div>

                          <span
                            class="
                              revision-priority
                              revision-priority-${W.escape(priority)}
                            "
                          >
                            ${W.escape(item.priority || "Medium")}
                          </span>

                        </div>

                        ${
                          item.whyWeak
                            ? `
                              <div
                                class="revision-why">

                                <strong>
                                  Why this needs revision
                                </strong>

                                <p>
                                  ${W.escape(item.whyWeak)}
                                </p>

                              </div>
                            `
                            : ""
                        }

                        ${
                          item.revisionNote
                            ? `
                              <div
                                class="revision-mini-note">

                                <h4>
                                  Quick Revision
                                </h4>

                                <p>
                                  ${W.escape(item.revisionNote)}
                                </p>

                              </div>
                            `
                            : ""
                        }

                        ${
                          item.definition
                            ? `
                              <div
                                class="revision-detail">

                                <h4>
                                  Definition
                                </h4>

                                <p>
                                  ${W.escape(item.definition)}
                                </p>

                              </div>
                            `
                            : ""
                        }

                        ${
                          item.formula
                            ? `
                              <div
                                class="revision-detail">

                                <h4>
                                  Formula
                                </h4>

                                <p
                                  class="revision-formula">

                                  ${W.escape(item.formula)}

                                </p>

                              </div>
                            `
                            : ""
                        }

                        ${
                          item.example
                            ? `
                              <div
                                class="revision-detail">

                                <h4>
                                  Teacher's Example
                                </h4>

                                <p>
                                  ${W.escape(item.example)}
                                </p>

                              </div>
                            `
                            : ""
                        }

                        ${
                          item.keyPoint
                            ? `
                              <div
                                class="revision-remember">

                                <strong>
                                  ✦ Remember
                                </strong>

                                <p>
                                  ${W.escape(item.keyPoint)}
                                </p>

                              </div>
                            `
                            : ""
                        }

                        ${
                          item.mistake
                            ? `
                              <div
                                class="revision-mistake">

                                ${
                                  item.mistake.question
                                    ? `
                                      <div
                                        class="revision-question">

                                        <strong>
                                          Question
                                        </strong>

                                        <p>
                                          ${W.escape(item.mistake.question)}
                                        </p>

                                      </div>
                                    `
                                    : ""
                                }

                                ${
                                  item.mistake.studentAnswer
                                    ? `
                                      <div
                                        class="
                                          revision-answer
                                          revision-wrong
                                        "
                                      >

                                        <strong>
                                          Your answer
                                        </strong>

                                        <p>
                                          ${W.escape(
                                            item.mistake.studentAnswer,
                                          )}
                                        </p>

                                      </div>
                                    `
                                    : ""
                                }

                                ${
                                  item.mistake.correctAnswer
                                    ? `
                                      <div
                                        class="
                                          revision-answer
                                          revision-correct
                                        "
                                      >

                                        <strong>
                                          Correct answer
                                        </strong>

                                        <p>
                                          ${W.escape(
                                            item.mistake.correctAnswer,
                                          )}
                                        </p>

                                      </div>
                                    `
                                    : ""
                                }

                              </div>
                            `
                            : ""
                        }

                      </section>
                    `;
                })
                .join("")}

            </div>
          `
          : `
            <div
              class="feature-empty">

              <span>
                ✓
              </span>

              <h2>
                No weak topics found
              </h2>

              <p>
                You performed well
                on this quiz.
              </p>

            </div>
          `
      }

      ${
        strongTopics.length
          ? `
            <div
              class="
                revision-section-title
                strong-section
              "
            >

              <span
                class="eyebrow">
                YOU'RE DOING WELL
              </span>

              <h2>
                Strong Topics
              </h2>

            </div>

            <div
              class="revision-strong-list">

              ${strongTopics
                .map(
                  (item) => `
                    <div
                      class="revision-strong-card">

                      <strong>
                        ✓
                        ${W.escape(item.topic || "Strong Topic")}
                      </strong>

                      ${
                        item.reason
                          ? `
                            <p>
                              ${W.escape(item.reason)}
                            </p>
                          `
                          : ""
                      }

                    </div>
                  `,
                )
                .join("")}

            </div>
          `
          : ""
      }
    `;
    content.insertAdjacentHTML('beforeend', `<div class="revision-actions"><a class="primary-btn" href="${W.href('retest', sourceId)}">Open Re-test / Practice →</a></div>`);
    const ready = window.MathJax?.startup?.promise;
    if (ready) ready.then(() => window.MathJax.typesetPromise([content])).catch(() => {});
  }

  // =====================================================
  // MAIN FEATURE RENDERER
  // =====================================================

  function render(row) {
    cleanup();
    cleanup = () => {};

    window.MathJax?.typesetClear?.([content]);

    saved = row;

    generate.hidden = !!row;

    if (download) {
      download.hidden = !row;
    }

    if (!row) {
      setStatus(
        "Your lecture is saved. Generate this study tool when you are ready.",
      );

      content.innerHTML = `
        <div class="feature-empty">

          <span>
            ✦
          </span>

          <h2>
            Your next discovery
            starts here
          </h2>

          <p>
            Generate this study tool
            once, then open it whenever
            you need it.
          </p>

        </div>
      `;

      return;
    }

    setStatus("Saved to your lecture · Ready to study");

    const data = readableJSON(row);

    if (type === "mindmap") {
      renderMindMap(data);
    } else if (type === "flashcards") {
      renderFlashcards(data);
    } else if (type === "quiz") {
      renderQuiz(data);
    } else if (type === "revision") {
      renderRevision(data);
    } else if (type === "questions" && Array.isArray(data)) {
      content.innerHTML = data
        .map(
          (q, i) => `
              <details
                class="question-detail important-question">

                <summary>

                  <span class="question-number">${i + 1}.</span>

                  <span class="question-title">${W.escape(q.question || q.q)}</span>

                </summary>

                <div
                  class="markdown">
                </div>

              </details>
            `,
        )
        .join("");

      content.querySelectorAll(".markdown").forEach((el, i) => {
        W.markdown(el, data[i].answer || data[i].a);
      });
    } else {
      content.innerHTML = '<div class="markdown lecture-prose"></div>';

      W.markdown(
        content.firstElementChild,
        row.content_text || "No readable text found.",
      );
    }
  }

  // =====================================================
  // GENERATE FEATURE
  // =====================================================

  async function runGeneration() {
    if (busy) {
      return;
    }

    busy = true;
    generate.disabled = true;

    setStatus("Creating your study material…");

    try {
      const result = await W.generate(sourceId, type);

      render(result.feature);

      await refreshState();
      window.StudyUI?.notify("Your study material is ready.", "success");
    } catch (error) {
      setStatus(error.message);
    } finally {
      busy = false;
      generate.disabled = false;
    }
  }

  generate.onclick = runGeneration;

  // =====================================================
  // DOWNLOAD / PRINT
  // =====================================================

  if (download) {
    download.onclick = async () => {
      if (!saved || download.disabled) {
        return;
      }

      const label = download.textContent;

      download.disabled = true;

      download.textContent = "Preparing PDF…";

      try {
        await StudyPrint.exportPdf();
      } catch (error) {
        setStatus("Unable to print: " + error.message);
      } finally {
        download.disabled = false;

        download.textContent = label;
      }
    };
  }

  // =====================================================
  // CHAT
  // =====================================================

  async function openChat() {
    generate.hidden = true;

    if (download) {
      download.hidden = true;
    }

    content.innerHTML = `
      <button
        id="olderChat"
        class="secondary-btn"
        type="button"
        hidden>
        Load earlier messages
      </button>

      <div
        class="chat-history"
        id="chatHistory">
      </div>

      <form
        id="chatForm"
        class="chat-composer">

        <label
          for="chatMessage">
          Ask about this lecture
        </label>

        <textarea
          id="chatMessage"
          maxlength="3000"
          rows="3"
          required
          placeholder="Explain a concept, compare ideas, or ask for an example…">
        </textarea>

        <button
          class="primary-btn"
          type="submit">
          Send question →
        </button>

      </form>
    `;

    const history = content.querySelector("#chatHistory");

    const form = content.querySelector("form");

    const input = content.querySelector("textarea");
    const suggestions = document.createElement("div"); suggestions.className = "chat-suggestions";
    for (const prompt of ["Explain the key ideas", "Give me a practical example", "Help me revise this lecture"]) { const button = document.createElement("button"); button.type = "button"; button.textContent = prompt; button.onclick = () => { input.value = prompt; input.focus(); }; suggestions.append(button); }
    form.before(suggestions);

    const key = `studygenie:chat:${sourceId}`;

    let pending;

    try {
      pending = JSON.parse(sessionStorage.getItem(key));
    } catch {}

    if (pending) {
      input.value = pending.message;
    }

    function turnElement(turn) {
      const node = document.createElement("section");

      node.className = "chat-turn";

      node.innerHTML = `
        <div
          class="chat-question">

          <span
            class="eyebrow">
            YOU
          </span>

          <p>
            ${W.escape(turn.question)}
          </p>

        </div>

        <div
          class="chat-answer">

          <span
            class="eyebrow">
            ✦ STUDYGENIE
          </span>

          <div
            class="markdown">
          </div>

          <small>
            Based on lecture excerpts
            ${W.escape((turn.excerpts || []).join(", "))}
          </small>

        </div>
      `;

      W.markdown(node.querySelector(".markdown"), turn.answer);

      return node;
    }

    let before = null;

    async function load(older = false) {
      const result = await StudyGenieAPI.request(
        W.base(sourceId) +
          "/chat" +
          (older && before ? "?before=" + encodeURIComponent(before) : ""),
      );

      if (!older) {
        history.replaceChildren();
      }

      const fragment = document.createDocumentFragment();

      result.turns.forEach((turn) => fragment.append(turnElement(turn)));

      if (older) {
        history.prepend(fragment);
      } else {
        history.append(fragment);
      }

      before = result.nextBefore;

      content.querySelector("#olderChat").hidden = !before;
    }

    content.querySelector("#olderChat").onclick = async () => {
      try {
        await load(true);
      } catch (e) {
        setStatus(e.message);
      }
    };

    form.onsubmit = async (e) => {
      e.preventDefault();

      const button = form.querySelector("button");

      if (button.disabled) {
        return;
      }

      const message = input.value.trim();

      if (!message) {
        return;
      }

      if (!pending || pending.message !== message) {
        pending = {
          message,
          requestId: crypto.randomUUID(),
        };
      }

      sessionStorage.setItem(key, JSON.stringify(pending));

      button.disabled = true;

      setStatus("Finding relevant lecture excerpts and preparing an answer…");

      try {
        await StudyGenieAPI.request(W.base(sourceId) + "/chat", {
          method: "POST",
          body: JSON.stringify(pending),
          lectureSaved: true,
        });

        sessionStorage.removeItem(key);

        pending = null;
        input.value = "";

        await load();
        await refreshState();

        setStatus("Conversation saved to this lecture.");
      } catch (error) {
        setStatus(error.message + " You can retry this question safely.");
      } finally {
        button.disabled = false;
      }
    };

    await load();

    setStatus(
      "Ask using your saved lecture. Your conversation is saved automatically.",
    );
  }

  // =====================================================
  // INITIAL LOAD
  // =====================================================

  try {
    if (!sourceId) {
      throw new Error("Choose a lecture from the workspace first.");
    }

    document
      .querySelectorAll('a[href="dashboard.html"]')
      .forEach(
        (a) =>
          (a.href = `dashboard.html?sourceId=${encodeURIComponent(sourceId)}`),
      );

    await refreshState();

    if (snapshot.source.status !== "ready") {
      throw new Error(
        "This lecture is still processing. Return to the workspace to follow progress.",
      );
    }

    if (type === "revision" && !snapshot.quizCompleted) {
      setStatus("Complete a quiz for this lecture to unlock Smart Revision.");

      content.innerHTML = `
        <a
          class="primary-btn"
          href="${W.href("quiz", sourceId)}">
          Open Quiz →
        </a>
      `;

      return;
    }

    if (type === "chat") {
      await openChat();
    } else {
      const result = await W.read(sourceId, type);

      render(result.feature);
    }
  } catch (error) {
    setStatus(error.message);

    content.innerHTML = `
      <div
        class="feature-empty">

        <p>
          We could not open this study tool.
          Reload this page to try again,
          or return to Workspace.
        </p>

      </div>
    `;
  } finally {
    content.setAttribute("aria-busy", "false");
  }

  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
      cleanup();
    }
  });
})();
