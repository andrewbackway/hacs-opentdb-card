type QuizConfig = { entity?: string; title?: string };
type Hass = { states: Record<string, { state: string; attributes: Record<string, unknown> }>; callService: (domain: string, service: string, data: Record<string, unknown>) => Promise<void> };

type QuizCard = HTMLElement & { hass?: Hass; config?: QuizConfig };

class OpenTdbCard extends HTMLElement {
  private _hass?: Hass;
  private _config: QuizConfig = {};
  private _feedbackTimer?: number;

  setConfig(config: QuizConfig) { this._config = config; this.render(); }
  set hass(value: Hass) { this._hass = value; this.render(); }

  static getStubConfig() { return { title: "Trivia Quiz" }; }

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

  private render() {
    const entity = this._config.entity;
    const state = this.getQuizState();
    if (!state || !entity) { this.innerHTML = `<ha-card><div class="empty">Choose an OpenTDB quiz entity.</div></ha-card>`; return; }
    const attrs = state.attributes;
    const prefix = entity.replace(/_quiz$/, "");
    const questionEntity = this._hass!.states[`${prefix}_question`];
    const scoreEntity = this._hass!.states[`${prefix}_score`];
    const elapsedEntity = this._hass!.states[`${prefix}_elapsed_time`];
    const question = questionEntity?.attributes;
    const score = scoreEntity?.attributes || {};
    const choices = Array.isArray(question?.answers) ? question.answers as string[] : [];
    const quizState = state.state;
    const feedback = attrs.feedback as { correct?: boolean } | undefined;
    this.innerHTML = `<ha-card><div class="wrap">
      <header><span>${this._config.title || attrs.quiz_name || "Trivia Quiz"}</span><span class="progress">${Number(attrs.question_index || 0) + 1} / ${attrs.total_questions || 0}</span></header>
      ${quizState === "idle" ? `<button class="primary" data-action="start">Start quiz</button>` : quizState === "complete" ? `<section class="complete"><strong>Quiz complete</strong><div class="result">${score.percentage || 0}%</div><div>${elapsedEntity?.state || 0}s</div><button class="primary" data-action="start">New quiz</button></section>` : `<section class="question"><h2>${question?.question || ""}</h2><div class="answers">${choices.map((choice, index) => `<button data-answer="${index}" ${feedback ? "disabled" : ""}>${choice}</button>`).join("")}</div>${feedback ? `<div class="feedback" role="status">${feedback.correct ? "Correct" : "Incorrect"}</div>` : ""}</section>`}
      <footer>Score: ${score.correct || 0} / ${score.answered || 0}</footer></div></ha-card>`;
    this.querySelectorAll<HTMLElement>("[data-action='start']").forEach(button => button.onclick = () => this.service("new_quiz"));
    this.querySelectorAll<HTMLButtonElement>("[data-answer]").forEach(button => button.onclick = () => {
      const index = Number(attrs.question_index || 0);
      const answer = choices[Number(button.dataset.answer)];
      void this.service("submit_answer", { question_index: index, answer }).then(() => {
        this._feedbackTimer = window.setTimeout(() => void this.service("next_question"), 900);
      });
    });
  }
}

customElements.define("opentdb-card", OpenTdbCard);
(window as unknown as { customCards?: unknown[] }).customCards ||= [];
(window as unknown as { customCards: unknown[] }).customCards.push({ type: "opentdb-card", name: "Open Trivia Database Quiz", description: "Interactive OpenTDB quiz" });
