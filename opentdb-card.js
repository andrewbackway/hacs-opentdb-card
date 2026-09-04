"use strict";
var _a;
class OpenTdbCard extends HTMLElement {
    constructor() {
        super(...arguments);
        this._config = {};
    }
    setConfig(config) { this._config = config; this.render(); }
    set hass(value) { this._hass = value; this.render(); }
    static getStubConfig() { return { title: "Trivia Quiz" }; }
    static getConfigElement() { return document.createElement("opentdb-card-editor"); }
    getQuizState() {
        if (!this._hass)
            return undefined;
        const entity = this._config.entity;
        return entity ? this._hass.states[entity] : undefined;
    }
    async service(service, data = {}) {
        const entity = this._config.entity;
        if (!this._hass || !entity)
            return;
        await this._hass.callService("opentdb", service, { ...data, entity_id: entity });
    }
    render() {
        const entity = this._config.entity;
        const state = this.getQuizState();
        if (!state || !entity) {
            this.innerHTML = `<ha-card><div class="empty">Choose an OpenTDB quiz entity.</div></ha-card>`;
            return;
        }
        const attrs = state.attributes;
        const prefix = entity.replace(/_quiz$/, "");
        const questionEntity = this._hass.states[`${prefix}_question`];
        const scoreEntity = this._hass.states[`${prefix}_score`];
        const elapsedEntity = this._hass.states[`${prefix}_elapsed_time`];
        const question = questionEntity?.attributes;
        const score = scoreEntity?.attributes || {};
        const choices = Array.isArray(question?.answers) ? question.answers : [];
        const quizState = state.state;
        const feedback = attrs.feedback;
        const cardName = this._config.title || "OpenTDB Quiz";
        const quizName = attrs.quiz_name || attrs.friendly_name || "Trivia Quiz";
        const questionNumber = Number(attrs.question_index || 0) + 1;
        const totalQuestions = Number(attrs.total_questions || 0);
        this.innerHTML = `<style>
      :host { display: block; color: var(--primary-text-color, #f7fbfc); }
      ha-card { overflow: hidden; background: var(--card-background-color, #10252b); border: 1px solid rgba(255, 255, 255, .12); border-radius: 18px; }
      .wrap { box-sizing: border-box; display: grid; gap: 14px; min-height: 260px; max-height: 460px; padding: clamp(16px, 3vw, 28px); overflow: auto; background: radial-gradient(circle at 100% 0, rgba(255, 190, 92, .2), transparent 34%), linear-gradient(135deg, #10252b 0%, #123b43 58%, #0c252d 100%); font-family: var(--paper-font-body1_-_font-family, sans-serif); }
      header { display: flex; align-items: end; justify-content: space-between; gap: 16px; border-bottom: 1px solid rgba(255, 255, 255, .2); padding-bottom: 12px; }
      .card-name { color: #ffd06f; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
      .quiz-name { margin-top: 3px; font-size: clamp(20px, 3vw, 30px); font-weight: 800; line-height: 1.08; }
      .progress { flex: 0 0 auto; color: #b9d7d7; font-size: 14px; font-weight: 700; white-space: nowrap; }
      .question { display: grid; gap: 14px; }
      h2 { margin: 0; max-width: 34em; font-size: clamp(20px, 3vw, 30px); line-height: 1.18; text-wrap: balance; }
      .answers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      button { min-height: 58px; border: 1px solid rgba(255, 255, 255, .24); border-radius: 12px; padding: 12px 16px; color: #f7fbfc; background: rgba(255, 255, 255, .1); font: inherit; font-size: 16px; font-weight: 700; line-height: 1.18; text-align: left; cursor: pointer; }
      button:hover, button:focus-visible { border-color: #ffd06f; background: rgba(255, 208, 111, .2); outline: 3px solid rgba(255, 208, 111, .35); outline-offset: 2px; }
      button:disabled { cursor: default; opacity: .7; }
      .primary { justify-self: center; min-width: min(260px, 100%); background: #ef715d; border-color: #ff9a7f; text-align: center; }
      .primary:hover, .primary:focus-visible { background: #ff866d; }
      .feedback { border-radius: 10px; padding: 10px 14px; background: #227d70; color: #fff; font-size: 18px; font-weight: 800; text-align: center; }
      .feedback.incorrect { background: #a64545; }
      .complete, .empty { display: grid; justify-items: center; gap: 10px; padding: 18px 0; text-align: center; }
      .complete strong { color: #ffd06f; font-size: 22px; }
      .result { color: #fff; font-size: clamp(48px, 8vw, 76px); font-weight: 900; line-height: 1; }
      .result-detail { color: #b9d7d7; font-size: 16px; }
      footer { color: #b9d7d7; font-size: 14px; font-weight: 700; text-align: right; }
      @media (max-width: 560px) { .wrap { max-height: none; } .answers { grid-template-columns: 1fr; } header { align-items: start; } }
    </style><ha-card><div class="wrap">
      <header><div><div class="card-name">${cardName}</div><div class="quiz-name">${quizName}</div></div><span class="progress">${questionNumber} / ${totalQuestions}</span></header>
      ${quizState === "idle" ? `<section class="empty"><strong>Ready when you are</strong><button class="primary" data-action="start">Start quiz</button></section>` : quizState === "complete" ? `<section class="complete"><strong>Quiz complete</strong><div class="result">${score.percentage || 0}%</div><div class="result-detail">${score.correct || 0} of ${score.answered || 0} correct · ${elapsedEntity?.state || 0}s</div><button class="primary" data-action="start">New quiz</button></section>` : `<section class="question"><h2>${question?.question || "Waiting for the next question..."}</h2><div class="answers">${choices.map((choice, index) => `<button data-answer="${index}" ${feedback ? "disabled" : ""}>${choice}</button>`).join("")}</div>${feedback ? `<div class="feedback${feedback.correct ? "" : " incorrect"}" role="status">${feedback.correct ? "Correct" : "Incorrect"}</div>` : ""}</section>`}
      <footer>Score: ${score.correct || 0} / ${score.answered || 0}</footer></div></ha-card>`;
        this.querySelectorAll("[data-action='start']").forEach(button => button.onclick = () => this.service("start_quiz"));
        this.querySelectorAll("[data-answer]").forEach(button => button.onclick = () => {
            const index = Number(attrs.question_index || 0);
            const answer = choices[Number(button.dataset.answer)];
            void this.service("submit_answer", { question_index: index, answer }).then(() => {
                this._feedbackTimer = window.setTimeout(() => void this.service("next_question"), 900);
            });
        });
    }
}
class OpenTdbCardEditor extends HTMLElement {
    constructor() {
        super(...arguments);
        this._config = {};
    }
    setConfig(config) {
        this._config = { ...config };
        this.render();
    }
    set hass(value) {
        this._hass = value;
        const form = this.querySelector("ha-form");
        if (form)
            form.hass = value;
    }
    render() {
        this.innerHTML = "<ha-form></ha-form>";
        const form = this.querySelector("ha-form");
        form.hass = this._hass;
        form.data = this._config;
        form.schema = [
            { name: "entity", selector: { entity: { domain: "sensor", integration: "opentdb" } } },
            { name: "title", selector: { text: {} } },
        ];
        form.addEventListener("value-changed", (event) => {
            const value = event.detail.value;
            this._config = value;
            this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: value } }));
        });
    }
}
customElements.define("opentdb-card", OpenTdbCard);
customElements.define("opentdb-card-editor", OpenTdbCardEditor);
(_a = window).customCards || (_a.customCards = []);
window.customCards.push({ type: "opentdb-card", name: "Open Trivia Database Quiz", description: "Interactive OpenTDB quiz" });
