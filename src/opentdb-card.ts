type QuizConfig = { quiz_id?: string; title?: string; sound?: boolean; shake?: boolean; show_new_quiz_button?: boolean };
type QuizFeedback = { correct?: boolean; answer?: string; correct_answer?: string; awarded_points?: number; speed_bonus?: number; streak_bonus?: number };
type QuizQuestion = { question?: string; answers?: string[]; category?: string; type?: string; difficulty?: string };
type QuizScore = { answered?: number; correct?: number; incorrect?: number; percentage?: number; points?: number; streak?: number; best_streak?: number };
type QuizSession = { session_id: string; set_id?: string; quiz_name?: string; question_index: number; total_questions: number; question?: QuizQuestion; feedback?: QuizFeedback; score?: QuizScore; elapsed_seconds?: number; complete?: boolean; leaderboard?: Record<string, any>[] };
type Hass = { callWS: <T>(message: Record<string, unknown>) => Promise<T> };
type HaForm = HTMLElement & { hass?: Hass; data?: QuizConfig; schema?: unknown[] };
type ValueChangedEvent = CustomEvent<{ value: QuizConfig }>;

type QuizCard = HTMLElement & { hass?: Hass; config?: QuizConfig };

class OpenTdbCard extends HTMLElement {
  private _hass?: Hass;
  private _config: QuizConfig = {};
  private _session?: QuizSession;
  private _sessionRequest = 0;
  private _submitting = false;
  private _serviceError?: string;
  private _selectedIndex?: number;
  private _feedbackTimer?: number;
  private _feedbackQuestion?: number;
  private _cuedQuestion?: number;
  private _completedCued = false;
  private _sessionError?: string;
  private _audioCtx?: AudioContext;

  setConfig(config: QuizConfig) {
    const changed = this._config.quiz_id !== config.quiz_id;
    this._config = config;
    if (changed) void this.startSession();
    this.render();
  }

  set hass(value: Hass) {
    const changed = this._hass !== value;
    this._hass = value;
    if (changed) void this.startSession();
    this.render();
  }

  disconnectedCallback() {
    this.clearFeedbackTimer();
    this._sessionRequest++;
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

  private async sessionRequest<T>(command: string, data: Record<string, unknown> = {}): Promise<T> {
    if (!this._hass || !this._config.quiz_id) throw new Error("Quiz is not configured");
    return this._hass.callWS<T>({ type: command, quiz_id: this._config.quiz_id, ...data });
  }

  private async startSession(command = "opentdb/session/start") {
    if (!this._hass || !this._config.quiz_id) return;
    const request = ++this._sessionRequest;
    this._session = undefined;
    this._sessionError = undefined;
    this.render();
    try {
      const session = await this.sessionRequest<QuizSession>(command);
      if (request !== this._sessionRequest || !this.isConnected) return;
      this._session = session;
      this._selectedIndex = undefined;
      this._submitting = false;
      this.render();
    } catch {
      if (request !== this._sessionRequest || !this.isConnected) return;
      this._sessionError = "Couldn't load the quiz. Check the OpenTDB integration.";
      this.render();
    }
  }

  private renderShell(content: string, stateClass: string, title: string, quizName: string, progress = "", footer = "") {
    const safeTitle = this.escapeHtml(title);
    const safeQuizName = this.escapeHtml(quizName);
    const safeProgress = this.escapeHtml(progress);
    const safeFooter = this.escapeHtml(footer);
    this.innerHTML = `<style>
      :host { display: block; min-width: 0; max-width: 100%; color: var(--primary-text-color, #f7fbfc); }
      ha-card { box-sizing: border-box; display: block; width: 100%; max-width: 100%; overflow: visible; background: var(--card-background-color, #10252b); border: 1px solid rgba(255, 255, 255, .12); border-radius: 8px; }
      .wrap { box-sizing: border-box; display: grid; grid-template-rows: auto auto auto; width: 100%; min-width: 0; max-width: 100%; gap: var(--opentdb-gap); min-height: 260px; padding: 20px; overflow: visible; background: radial-gradient(circle at 100% 0, rgba(255, 190, 92, .2), transparent 34%), linear-gradient(135deg, #10252b 0%, #123b43 58%, #0c252d 100%); font-family: var(--paper-font-body1_-_font-family, sans-serif); }
      header { display: flex; align-items: end; justify-content: space-between; gap: 16px; min-width: 0; border-bottom: 1px solid rgba(255, 255, 255, .2); padding-bottom: 12px; }
      .title-block { min-width: 0; }
      .card-name { overflow: hidden; color: var(--opentdb-accent); font-size: 12px; font-weight: 800; letter-spacing: .08em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
      .quiz-name { display: -webkit-box; overflow: hidden; margin-top: 3px; font-size: 26px; font-weight: 800; line-height: 1.08; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
      .progress { flex: 0 0 auto; color: #b9d7d7; font-size: 14px; font-weight: 700; white-space: nowrap; }
      main { min-height: 0; }
      .question-region { display: grid; align-content: start; min-width: 0; gap: var(--opentdb-gap); }
      .question-copy { min-width: 0; }
      .question-copy h2 { margin: 0; max-width: 34em; overflow: visible; overflow-wrap: anywhere; text-overflow: clip; white-space: normal; font-size: 28px; line-height: 1.18; }
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
      .leaderboard { display: grid; gap: 6px; width: min(440px, 100%); margin: 4px auto 0; padding: 0; list-style: none; }
      .leaderboard li { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 7px 12px; border-radius: 8px; background: rgba(255, 255, 255, .08); font-size: 15px; font-weight: 700; }
      .lb-rank { color: var(--opentdb-accent); font-weight: 900; }
      .lb-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
      .lb-points { color: #b9d7d7; white-space: nowrap; }
      .complete { overflow: auto; }
      .feedback.correct { animation: opentdb-pop 260ms ease-out; }
      @keyframes opentdb-pop { 0% { transform: scale(.9); } 50% { transform: scale(1.06); } 100% { transform: scale(1); } }
      :host { --opentdb-gap: 12px; --opentdb-answer-min-height: 56px; --opentdb-accent: #ffd06f; --opentdb-primary: #ef715d; --opentdb-correct: #227d70; --opentdb-incorrect: #a64545; }
      @media (max-width: 560px) { .answers { grid-template-columns: 1fr; } header { align-items: start; flex-wrap: wrap; } .progress { flex-basis: 100%; text-align: right; } .question-copy h2 { font-size: 24px; } }
      @media (prefers-reduced-motion: reduce) { .shake, .feedback.correct { animation: none; } }
    </style><ha-card><div class="wrap ${stateClass}">
      <header><div class="title-block"><div class="card-name">${safeTitle}</div><div class="quiz-name">${safeQuizName}</div></div>${safeProgress ? `<div class="progress">${safeProgress}</div>` : ""}</header>
      <main>${content}</main>
      <footer>${safeFooter}</footer>
    </div></ha-card>`;
  }

  private render() {
    const cardName = this._config.title || "Open Trivia DB Quiz";
    const quizId = this._config.quiz_id;
    if (!quizId) {
      this.renderShell(`<section class="empty"><strong>Choose a quiz to begin</strong><div class="result-detail">Set an OpenTDB quiz ID in the card configuration.</div></section>`, "state-unconfigured", cardName, "Trivia Quiz", "", "");
      return;
    }
    if (!this._session) {
      const message = this._sessionError || "Loading your quiz...";
      this.renderShell(`<section class="unavailable"><strong>${this._sessionError ? "Quiz unavailable" : "Loading quiz"}</strong><p>${this.escapeHtml(message)}</p></section>`, this._sessionError ? "state-unavailable" : "state-loading", cardName, "Trivia Quiz", "", "");
      return;
    }
    const session = this._session;
    const question = session.question || {};
    const score = session.score || {};
    const feedback = session.feedback;
    const leaderboard = Array.isArray(session.leaderboard) ? session.leaderboard : [];
    const choices = Array.isArray(question.answers) ? (question.answers as unknown[]).filter((choice): choice is string => typeof choice === "string") : [];
    const quizName = typeof session.quiz_name === "string" ? session.quiz_name : "Trivia Quiz";
    const questionIndex = Number(session.question_index);
    const totalQuestions = Number(session.total_questions || 0);
    const elapsed = Number(session.elapsed_seconds || 0);
    const points = Number(score.points || 0);
    const streak = Number(score.streak || 0);
    const quizState = session.complete ? "complete" : feedback ? "feedback" : question.question ? "question" : "idle";

    if (!feedback && !this._submitting) {
      this.clearFeedbackTimer();
      this._selectedIndex = undefined;
      this._cuedQuestion = undefined;
    }

    this.maybeCue(feedback, questionIndex, quizState);

    const footer = quizState === "idle" || quizState === "complete" ? "" : `${points} pts${streak > 1 ? `  \u00b7  ${streak}x streak` : ""}  \u00b7  ${score.correct || 0}/${score.answered || 0}`;
    const progress = quizState === "idle" || quizState === "complete" || !Number.isFinite(questionIndex) || questionIndex < 0 || totalQuestions <= 0 ? "" : `Question ${questionIndex + 1} of ${totalQuestions}`;

    const content = quizState === "idle"
      ? `<section class="empty"><strong>Ready when you are</strong><button class="primary" data-action="start">Start quiz</button></section>`
      : quizState === "complete"
        ? this.renderComplete(score, elapsed, leaderboard)
        : this.renderQuestion(question, choices, feedback);

    this.renderShell(content, feedback ? "state-feedback" : quizState === "idle" ? "state-idle" : quizState === "complete" ? "state-complete" : "state-question", cardName, quizName, progress, footer);
    this.wireEvents(choices, questionIndex, feedback);

    if (feedback && !session.complete && this._feedbackQuestion !== questionIndex && Number.isFinite(questionIndex)) {
      this._submitting = false;
      this.clearFeedbackTimer();
      this._feedbackQuestion = questionIndex;
      this._feedbackTimer = window.setTimeout(() => {
        this._feedbackTimer = undefined;
        if (!this.isConnected) return;
        void this.advanceSession();
      }, 1300);
    }
  }

  private async advanceSession() {
    const request = ++this._sessionRequest;
    try {
      const session = await this.sessionRequest<QuizSession>("opentdb/session/next", { session_id: this._session?.session_id });
      if (request !== this._sessionRequest || !this.isConnected) return;
      if (this._session?.set_id && session.set_id && this._session.set_id !== session.set_id) {
        void this.startSession();
        return;
      }
      this._session = session;
      this._selectedIndex = undefined;
      this.render();
    } catch {
      if (request !== this._sessionRequest || !this.isConnected) return;
      this._sessionError = "Couldn't load the next question.";
      this.render();
    }
  }

  private renderQuestion(question: QuizQuestion, choices: string[], feedback?: QuizFeedback) {
    const correctText = typeof feedback?.correct_answer === "string" ? feedback.correct_answer : undefined;
    const selectedIndex = this._selectedIndex ?? (feedback ? choices.findIndex((choice) => choice === feedback.answer) : -1);
    const shake = feedback && !feedback.correct && this._config.shake !== false ? " shake" : "";
    const questionText = typeof question.question === "string" ? question.question : "Waiting for the next question...";
    const answers = choices.map((choice, index) => {
      const selected = index === selectedIndex;
      const isCorrectAnswer = correctText !== undefined && choice === correctText;
      const correct = !!feedback && selected && !!feedback.correct;
      const incorrect = !!feedback && selected && !feedback.correct;
      const marker = String.fromCharCode(65 + index);
      const icon = correct || isCorrectAnswer ? "mdi:check-circle" : incorrect ? "mdi:close-circle" : "mdi:circle-outline";
      const stateClass = correct ? " answer-selected answer-correct" : incorrect ? " answer-selected answer-incorrect" : isCorrectAnswer && feedback ? " answer-revealed-correct" : "";
      const label = `${marker}. ${choice}${isCorrectAnswer && feedback ? ", correct answer" : ""}`;
      return `<button class="answer${stateClass}" data-answer-index="${index}" aria-label="${this.escapeHtml(label)}" aria-pressed="${selected ? "true" : "false"}" ${this._submitting || feedback ? "disabled" : ""}><span class="answer-marker">${marker}</span><span class="answer-label">${this.escapeHtml(choice)}</span><ha-icon class="answer-icon" icon="${icon}"></ha-icon></button>`;
    }).join("");
    const banner = feedback
      ? `<div class="feedback ${feedback.correct ? "correct" : "incorrect"}" role="status" aria-live="polite"><ha-icon icon="${feedback.correct ? "mdi:check-circle" : "mdi:close-circle"}"></ha-icon>${feedback.correct ? `Correct  +${this.escapeHtml(feedback.awarded_points ?? 0)}` : "Incorrect"}</div>`
      : this._serviceError
        ? `<div class="feedback service-error" role="status" aria-live="polite">${this.escapeHtml(this._serviceError)}</div>`
        : "";
    return `<section class="question-region${shake}" aria-busy="${this._submitting ? "true" : "false"}"><div class="question-copy"><h2>${this.escapeHtml(questionText)}</h2></div><div class="answers" role="group" aria-label="Answer choices">${answers}</div>${banner}</section>`;
  }

  private renderComplete(score: QuizScore, elapsed: number, leaderboard: Record<string, any>[]) {
    const board = leaderboard.length
      ? `<ol class="leaderboard" aria-label="Leaderboard">${leaderboard.slice(0, 5).map((row, index) => `<li><span class="lb-rank">${index + 1}</span><span class="lb-name">${this.escapeHtml(row.name ?? "Player")}</span><span class="lb-points">${this.escapeHtml(row.points_today ?? 0)} pts</span></li>`).join("")}</ol>`
      : "";
    const newQuizButton = this._config.show_new_quiz_button !== false
      ? `<button class="primary" data-action="new">New quiz</button>`
      : "";
    return `<section class="complete"><strong>Quiz complete</strong><div class="result">${this.escapeHtml(score.percentage || 0)}%</div><div class="result-detail">${this.escapeHtml(score.correct || 0)} of ${this.escapeHtml(score.answered || 0)} correct \u00b7 ${this.escapeHtml(score.points || 0)} pts \u00b7 ${this.escapeHtml(elapsed)}s</div>${board}${newQuizButton}</section>`;
  }

  private wireEvents(choices: string[], questionIndex: number, feedback?: QuizFeedback) {
    this.querySelectorAll<HTMLElement>("[data-action='start']").forEach((button) => button.onclick = () => { this.unlockAudio(); void this.startSession(); });
    this.querySelectorAll<HTMLElement>("[data-action='new']").forEach((button) => button.onclick = () => { this.unlockAudio(); void this.startSession("opentdb/session/new"); });
    this.querySelectorAll<HTMLButtonElement>("[data-answer-index]").forEach((button) => button.onclick = () => {
      if (this._submitting || feedback) return;
      this.unlockAudio();
      const answerIndex = Number(button.dataset.answerIndex);
      const answer = choices[answerIndex];
      if (!Number.isInteger(answerIndex) || answer === undefined) return;
      this._submitting = true;
      this._selectedIndex = answerIndex;
      this._serviceError = undefined;
      this.render();
      const request = ++this._sessionRequest;
      void this.sessionRequest<QuizSession>("opentdb/session/submit", { session_id: this._session?.session_id, question_index: Number.isFinite(questionIndex) ? questionIndex : 0, answer }).then((session) => {
        if (request !== this._sessionRequest || !this.isConnected) return;
        if (this._session?.set_id && session.set_id && this._session.set_id !== session.set_id) {
          void this.startSession();
          return;
        }
        this._session = session;
        this.render();
      }).catch(() => {
        this._submitting = false;
        this._serviceError = "Couldn't submit that answer. Try again.";
        this.render();
      });
    });
  }

  private maybeCue(feedback: QuizFeedback | undefined, questionIndex: number, quizState: string) {
    if (quizState === "complete") {
      if (!this._completedCued) {
        this._completedCued = true;
        if (this._config.sound !== false) this.playFanfare();
      }
      return;
    }
    this._completedCued = false;
    if (!feedback || this._cuedQuestion === questionIndex) return;
    this._cuedQuestion = questionIndex;
    if (this._config.sound === false) return;
    if (feedback.correct) this.playChime(); else this.playBuzzer();
  }

  private unlockAudio() {
    if (this._config.sound === false) return;
    try {
      if (!this._audioCtx) {
        const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
          || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) this._audioCtx = new Ctx();
      }
      if (this._audioCtx?.state === "suspended") void this._audioCtx.resume();
    } catch {
      /* audio is best-effort */
    }
  }

  private tone(freq: number, startOffset: number, duration: number, type: OscillatorType, peak: number) {
    const ctx = this._audioCtx;
    if (!ctx) return;
    const t0 = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  private playChime() {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => this.tone(freq, index * 0.08, 0.25, "sine", 0.18));
  }

  private playBuzzer() {
    this.tone(150, 0, 0.42, "sawtooth", 0.2);
    this.tone(146, 0, 0.42, "square", 0.12);
  }

  private playFanfare() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, index) => this.tone(freq, index * 0.12, 0.32, "triangle", 0.16));
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
    form.schema = [
      { name: "quiz_id", selector: { entity: { domain: "sensor", integration: "opentdb" } } },
      { name: "title", selector: { text: {} } },
      { name: "sound", selector: { boolean: {} } },
      { name: "shake", selector: { boolean: {} } },
      { name: "show_new_quiz_button", selector: { boolean: {} } },
    ];
    form.data = this._config;
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
