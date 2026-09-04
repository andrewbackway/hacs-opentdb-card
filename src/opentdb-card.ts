type QuizConfig = { entity?: string; title?: string };
type Hass = { states: Record<string, { state: string; attributes: Record<string, unknown> }>; callService: (domain: string, service: string, data: Record<string, unknown>) => Promise<void> };
type HaForm = HTMLElement & { hass?: Hass; data?: QuizConfig; schema?: unknown[] };
type ValueChangedEvent = CustomEvent<{ value: QuizConfig }>;

type QuizCard = HTMLElement & { hass?: Hass; config?: QuizConfig };

class OpenTdbCard extends HTMLElement {
  private _hass?: Hass;
  private _config: QuizConfig = {};
  private _submitting = false;
  private _serviceError?: string;
  private _selectedIndex?: number;
  private _feedbackTimer?: number;
  private _feedbackQuestion?: number;

  setConfig(config: QuizConfig) { this._config = config; this.render(); }
  set hass(value: Hass) { this._hass = value; this.render(); }

  disconnectedCallback() {
    this.clearFeedbackTimer();
  }

  static getStubConfig() { return { title: "Trivia Quiz" }; }
  static getConfigElement() { return document.createElement("opentdb-card-editor"); }

  private escapeHtml(value: unknown): string {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[character]!);
  }

  private clearFeedbackTimer() {
    if (this._feedbackTimer !== undefined) {
      window.clearTimeout(this._feedbackTimer);
      this._feedbackTimer = undefined;
      this._feedbackQuestion = undefined;
    }
  }

  private getQuizState() {
    if (!this._hass) return undefined;
    const entity = this._config.entity;
    return entity ? this._hass.states[entity] : undefined;
  }

  private async service(service: string, data: Record<string, unknown> = {}) {
    const entity = this._config.entity;
    if (!this._hass || !entity) return;
    await this._hass.callService("opentdb", service, { ...data, entity_id: entity });
  }

  private renderShell(content: string, stateClass: string, title: string, quizName: string, progress = "", footer = "") {
    const safeTitle = this.escapeHtml(title);
    const safeQuizName = this.escapeHtml(quizName);
    const safeProgress = this.escapeHtml(progress);
    const safeFooter = this.escapeHtml(footer);
    this.innerHTML = `<style>
      :host { display: block; color: var(--primary-text-color, #f7fbfc); }
      ha-card { overflow: hidden; background: var(--card-background-color, #10252b); border: 1px solid rgba(255, 255, 255, .12); border-radius: 8px; }
      .wrap { box-sizing: border-box; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: var(--opentdb-gap); min-height: 260px; max-height: var(--opentdb-card-height); padding: 20px; overflow: hidden; background: radial-gradient(circle at 100% 0, rgba(255, 190, 92, .2), transparent 34%), linear-gradient(135deg, #10252b 0%, #123b43 58%, #0c252d 100%); font-family: var(--paper-font-body1_-_font-family, sans-serif); }
      header { display: flex; align-items: end; justify-content: space-between; gap: 16px; min-width: 0; border-bottom: 1px solid rgba(255, 255, 255, .2); padding-bottom: 12px; }
      .title-block { min-width: 0; }
      .card-name { overflow: hidden; color: var(--opentdb-accent); font-size: 12px; font-weight: 800; letter-spacing: .08em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
      .quiz-name { display: -webkit-box; overflow: hidden; margin-top: 3px; font-size: 26px; font-weight: 800; line-height: 1.08; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
      .progress { flex: 0 0 auto; color: #b9d7d7; font-size: 14px; font-weight: 700; white-space: nowrap; }
      main { min-height: 0; }
      .question-region { display: grid; align-content: start; gap: var(--opentdb-gap); min-height: 0; overflow: auto; overscroll-behavior: contain; }
      .question-copy h2 { margin: 0; max-width: 34em; font-size: 28px; line-height: 1.18; }
      .answers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      button { display: grid; grid-template-columns: 30px minmax(0, 1fr) 24px; align-items: center; min-height: var(--opentdb-answer-min-height); border: 1px solid rgba(255, 255, 255, .24); border-radius: 8px; padding: 12px 14px; color: #f7fbfc; background: rgba(255, 255, 255, .1); font: inherit; font-size: 17px; font-weight: 700; line-height: 1.18; text-align: left; cursor: pointer; }
      button:hover, button:focus-visible { border-color: var(--opentdb-accent); background: rgba(255, 208, 111, .2); outline: 3px solid rgba(255, 208, 111, .35); outline-offset: 2px; }
      button:disabled { cursor: default; opacity: .78; }
      .answer-marker { color: var(--opentdb-accent); font-size: 14px; font-weight: 900; }
      .answer-label { min-width: 0; overflow-wrap: anywhere; }
      .answer-icon { justify-self: end; opacity: 0; }
      .answer-selected .answer-icon, .answer-revealed-correct .answer-icon { opacity: 1; }
      .answer-correct { border-color: #78e0b0; background: rgba(34, 125, 112, .72); }
      .answer-incorrect { border-color: #ff9a7f; background: rgba(166, 69, 69, .78); }
      .answer-revealed-correct { border-color: #78e0b0; background: rgba(34, 125, 112, .5); }
      .primary { justify-self: center; grid-template-columns: 1fr; min-width: min(260px, 100%); background: var(--opentdb-primary); border-color: #ff9a7f; text-align: center; }
      .primary:hover, .primary:focus-visible { background: #ff866d; }
      .feedback { display: flex; align-items: center; justify-content: center; gap: 8px; border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 18px; font-weight: 800; text-align: center; }
      .feedback.correct { background: var(--opentdb-correct); }
      .feedback.incorrect, .service-error { background: var(--opentdb-incorrect); }
      .complete, .empty, .unavailable { display: grid; justify-items: center; align-content: center; gap: 10px; min-height: 0; padding: 18px 0; text-align: center; }
      .complete strong, .empty strong { color: var(--opentdb-accent); font-size: 22px; }
      .result { color: #fff; font-size: 64px; font-weight: 900; line-height: 1; }
      .result-detail, .unavailable p { color: #b9d7d7; font-size: 16px; }
      .service-error { border-radius: 8px; padding: 10px 14px; color: #fff; font-weight: 700; }
      footer { color: #b9d7d7; font-size: 14px; font-weight: 700; text-align: right; }
      .shake { animation: opentdb-shake 220ms ease-in-out; }
      @keyframes opentdb-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-7px); } 75% { transform: translateX(7px); } }
      :host { --opentdb-card-height: 390px; --opentdb-gap: 12px; --opentdb-answer-min-height: 56px; --opentdb-accent: #ffd06f; --opentdb-primary: #ef715d; --opentdb-correct: #227d70; --opentdb-incorrect: #a64545; }
      @media (max-width: 560px) { .wrap { max-height: none; } .answers { grid-template-columns: 1fr; } header { align-items: start; } .question-copy h2 { font-size: 24px; } }
      @media (prefers-reduced-motion: reduce) { .shake { animation: none; } }
    </style><ha-card><div class="wrap ${stateClass}">
      <header><div class="title-block"><div class="card-name">${safeTitle}</div><div class="quiz-name">${safeQuizName}</div></div>${safeProgress ? `<div class="progress">${safeProgress}</div>` : ""}</header>
      <main>${content}</main>
      <footer>${safeFooter}</footer>
    </div></ha-card>`;
  }

  private render() {
    const entity = this._config.entity;
    const state = this.getQuizState();
    const cardName = this._config.title || "Open Trivia DB Quiz";
    if (!entity) {
      this.renderShell(`<section class="empty"><strong>Choose a quiz to begin</strong><div class="result-detail">Select an OpenTDB quiz entity in the card configuration.</div></section>`, "state-unconfigured", cardName, "Trivia Quiz", "", "");
      return;
    }
    if (!state || state.state === "unavailable" || state.state === "unknown") {
      this.renderShell(`<section class="unavailable"><strong>Quiz unavailable</strong><p>Waiting for the OpenTDB quiz entity.</p></section>`, "state-unavailable", cardName, "Trivia Quiz", "", "");
      return;
    }
    const attrs = state.attributes;
    const prefix = entity.replace(/_quiz$/, "");
    const questionEntity = this._hass!.states[`${prefix}_question`];
    const scoreEntity = this._hass!.states[`${prefix}_score`];
    const elapsedEntity = this._hass!.states[`${prefix}_elapsed_time`];
    const question = questionEntity?.attributes;
    const score = scoreEntity?.attributes || {};
    const choices = Array.isArray(question?.answers) ? question.answers.filter((choice): choice is string => typeof choice === "string") : [];
    const quizState = state.state;
    const feedback = attrs.feedback as { correct?: boolean } | undefined;
    const quizName = typeof attrs.quiz_name === "string" ? attrs.quiz_name : typeof attrs.friendly_name === "string" ? attrs.friendly_name : "Trivia Quiz";
    const questionIndex = Number(attrs.question_index);
    const totalQuestions = Number(attrs.total_questions || 0);
    if (!feedback && !this._submitting) {
      this.clearFeedbackTimer();
      this._selectedIndex = undefined;
    }
    const footer = quizState === "idle" || quizState === "complete" ? "" : `Score: ${score.correct || 0} / ${score.answered || 0}`;
    const progress = quizState === "idle" || quizState === "complete" || !Number.isFinite(questionIndex) || questionIndex < 0 || totalQuestions <= 0 ? "" : `Question ${questionIndex + 1} of ${totalQuestions}`;
    const content = quizState === "idle" ? `<section class="empty"><strong>Ready when you are</strong><button class="primary" data-action="start">Start quiz</button></section>` : quizState === "complete" ? `<section class="complete"><strong>Quiz complete</strong><div class="result">${this.escapeHtml(score.percentage || 0)}%</div><div class="result-detail">${this.escapeHtml(score.correct || 0)} of ${this.escapeHtml(score.answered || 0)} correct, ${this.escapeHtml(elapsedEntity?.state || 0)}s</div><button class="primary" data-action="start">New quiz</button></section>` : `<section class="question-region${feedback?.correct === false ? " shake" : ""}" aria-busy="${this._submitting ? "true" : "false"}"><div class="question-copy"><h2>${this.escapeHtml(typeof question?.question === "string" ? question.question : "Waiting for the next question...")}</h2></div><div class="answers" role="group" aria-label="Answer choices">${choices.map((choice, index) => {
      const selected = this._selectedIndex === index;
      const correctAnswer = typeof question?.correct_answer === "string" && choice === question.correct_answer;
      const correct = feedback && selected && feedback.correct;
      const incorrect = feedback && selected && !feedback.correct;
      const icon = correct || correctAnswer ? "mdi:check-circle" : incorrect ? "mdi:close-circle" : "mdi:circle-outline";
      const stateClass = correct ? " answer-selected answer-correct" : incorrect ? " answer-selected answer-incorrect" : correctAnswer && feedback ? " answer-revealed-correct" : "";
      const label = `${String.fromCharCode(65 + index)}. ${choice}${correctAnswer && feedback ? ", correct answer" : ""}`;
      return `<button class="answer${stateClass}" data-answer-index="${index}" aria-label="${this.escapeHtml(label)}" aria-pressed="${selected ? "true" : "false"}" ${this._submitting || feedback ? "disabled" : ""}><span class="answer-marker">${String.fromCharCode(65 + index)}</span><span class="answer-label">${this.escapeHtml(choice)}</span><ha-icon class="answer-icon" icon="${icon}"></ha-icon></button>`;
    }).join("")}</div>${feedback ? `<div class="feedback ${feedback.correct ? "correct" : "incorrect"}" role="status" aria-live="polite"><ha-icon icon="${feedback.correct ? "mdi:check-circle" : "mdi:close-circle"}"></ha-icon>${feedback.correct ? "Correct" : "Incorrect"}${feedback.correct ? "" : " - correct answer revealed"}</div>` : this._serviceError ? `<div class="feedback service-error" role="status" aria-live="polite">${this.escapeHtml(this._serviceError)}</div>` : ""}</section>`;
    this.renderShell(content, feedback ? "state-feedback" : quizState === "idle" ? "state-idle" : quizState === "complete" ? "state-complete" : "state-question", cardName, quizName, progress, footer);
    this.querySelectorAll<HTMLElement>("[data-action='start']").forEach(button => button.onclick = () => this.service("start_quiz"));
    this.querySelectorAll<HTMLButtonElement>("[data-answer-index]").forEach(button => button.onclick = () => {
      if (this._submitting || feedback) return;
      const answerIndex = Number(button.dataset.answerIndex);
      const answer = choices[answerIndex];
      if (!Number.isInteger(answerIndex) || answer === undefined) return;
      this._submitting = true;
      this._selectedIndex = answerIndex;
      this._serviceError = undefined;
      this.render();
      void this.service("submit_answer", { question_index: Number.isFinite(questionIndex) ? questionIndex : 0, answer }).catch(() => {
        this._submitting = false;
        this._serviceError = "Couldn't submit that answer. Try again.";
        this.render();
      });
    });
    if (feedback && this._feedbackQuestion !== questionIndex && Number.isFinite(questionIndex)) {
      this._submitting = false;
      this.clearFeedbackTimer();
      this._feedbackQuestion = questionIndex;
      this._feedbackTimer = window.setTimeout(() => {
        this._feedbackTimer = undefined;
        void this.service("next_question");
      }, 900);
    }
  }
}

class OpenTdbCardEditor extends HTMLElement {
  private _config: QuizConfig = {};
  private _hass?: Hass;

  setConfig(config: QuizConfig) {
    this._config = { ...config };
    this.render();
  }

  set hass(value: Hass) {
    this._hass = value;
    const form = this.querySelector<HaForm>("ha-form");
    if (form) form.hass = value;
  }

  private render() {
    this.innerHTML = "<ha-form></ha-form>";
    const form = this.querySelector<HaForm>("ha-form")!;
    form.hass = this._hass;
    form.data = this._config;
    form.schema = [
      { name: "entity", selector: { entity: { domain: "sensor", integration: "opentdb" } } },
      { name: "title", selector: { text: {} } },
    ];
    form.addEventListener("value-changed", (event) => {
      const value = (event as ValueChangedEvent).detail.value;
      this._config = value;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: value } }));
    });
  }
}

customElements.define("opentdb-card", OpenTdbCard);
customElements.define("opentdb-card-editor", OpenTdbCardEditor);
(window as unknown as { customCards?: unknown[] }).customCards ||= [];
(window as unknown as { customCards: unknown[] }).customCards.push({ type: "opentdb-card", name: "Open Trivia Database Quiz", description: "Interactive OpenTDB quiz" });
