(function () {
  "use strict";

  const mountedForms = new WeakMap();
  let instanceCount = 0;
  const definitions = [
    { label: "Hospitation", title: "Hospitation und Kontext", hint: "Ordne die Beobachtung einer Hospitation zu.", fields: ["hospitationId"] },
    { label: "Beobachtung", title: "Beobachtung festhalten", hint: "Beschreibe die konkrete Situation. Kurzfassung und Beobachtung sind Pflichtfelder.", fields: ["title", "description", "immediateConsequence"] },
    { label: "Quelle", title: "Quelle und Nachdokumentation", hint: "Halte fest, worauf die Aussage beruht und was noch zu klären ist.", fields: ["evidenceType", "sourceReference", "uncertainty"] },
    { label: "Einordnung", title: "Freiwillige Einordnung", hint: "Alle Zuordnungen können offenbleiben. Gleiche Codes belegen noch kein Muster.", fields: ["processPhase", "problemType", "impact", "involvedRoles", "observationType"] },
    { label: "Prüfen", title: "Nächster Schritt und Prüfung", hint: "Ergänze bei Bedarf Produktbezug und Relevanz. Prüfe die Angaben vor dem Speichern.", fields: ["nextStep", "affectedProducts", "relevanceScore", "usageRecommendation", "relevanceReason"] }
  ];

  function element(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text != null) result.textContent = text;
    return result;
  }

  function button(className, text) {
    const result = element("button", className, text);
    result.type = "button";
    return result;
  }

  function controlsWithin(root) {
    return [...root.querySelectorAll("input, select, textarea")];
  }

  function invalidControl(root) {
    return controlsWithin(root).find((control) => control.willValidate && !control.validity.valid);
  }

  function fieldWrapper(form, name) {
    const control = form.querySelector(`[name="${name}"]`);
    return control?.closest("[data-codebook-field], .observation-form-field, label") || control;
  }

  function enhance(form) {
    if (mountedForms.has(form)) return mountedForms.get(form);
    const actions = form.querySelector(".observation-detail-actions");
    const saveButtons = [...form.querySelectorAll('button[type="submit"], input[type="submit"]')];
    if (!actions || !saveButtons.length || !form.querySelector('[name="title"]') || !form.querySelector('[name="description"]')) return null;

    const prefix = `observation-steps-${++instanceCount}`;
    let current = 0;
    let furthest = 0;
    const originalGroups = [...form.children].filter((child) => child !== actions && child.matches(".observation-form-notes, [data-observation-coding], [data-codebook-additional]"));
    const fieldNodes = new Map(definitions.flatMap((step) => step.fields).map((name) => [name, fieldWrapper(form, name)]));
    const nav = element("nav", "hos-steps-nav");
    nav.setAttribute("aria-label", "Schritte der Beobachtung");
    const list = element("ol", "hos-steps-list");
    nav.append(list);
    const progress = element("p", "hos-steps-progress");
    progress.setAttribute("role", "status");
    progress.setAttribute("aria-live", "polite");
    progress.setAttribute("aria-atomic", "true");
    const body = element("div", "hos-steps-body");
    const panels = [];
    const headings = [];
    const stepButtons = [];
    const contents = [];

    definitions.forEach((definition, index) => {
      const item = element("li", "hos-steps-item");
      const stepButton = button("hos-steps-button", "");
      stepButton.setAttribute("aria-controls", `${prefix}-panel-${index}`);
      stepButton.setAttribute("aria-label", `Schritt ${index + 1}: ${definition.title}`);
      const number = element("span", "hos-steps-number", String(index + 1));
      number.setAttribute("aria-hidden", "true");
      stepButton.append(number, element("span", "hos-steps-label", definition.label));
      stepButton.addEventListener("click", () => {
        if (index > furthest || (index > current && !validatePanel())) return;
        show(index, { focusHeading: true });
      });
      item.append(stepButton);
      list.append(item);
      stepButtons.push(stepButton);

      const panel = element("section", "hos-steps-panel");
      panel.id = `${prefix}-panel-${index}`;
      panel.dataset.observationStep = String(index);
      panel.setAttribute("aria-labelledby", `${prefix}-title-${index}`);
      const heading = element("h3", "hos-steps-title", definition.title);
      heading.id = `${prefix}-title-${index}`;
      heading.tabIndex = -1;
      const headingRow = element("div", "hos-steps-heading");
      headingRow.append(heading);
      const content = element("div", "hos-steps-fields");
      panel.append(headingRow, element("p", "hos-steps-hint", definition.hint), content);
      definition.fields.forEach((name) => {
        const field = fieldNodes.get(name);
        if (field) content.append(field);
      });
      panels.push(panel);
      headings.push(heading);
      contents.push(content);
      body.append(panel);
    });

    if (!fieldNodes.get("hospitationId")) {
      contents[0].append(element("p", "hos-steps-context", "Diese Beobachtung gehört bereits zu einer Hospitation. Die Zuordnung bleibt beim Bearbeiten erhalten."));
    }

    const codingInfo = form.querySelector('[data-observation-coding] > summary .observation-field-info');
    if (codingInfo) panels[3].querySelector(".hos-steps-heading").append(codingInfo);
    const codebook = form.querySelector("[data-hospitation-codebook-guide]");
    if (codebook) contents[3].append(codebook);
    const assessmentHint = form.querySelector("[data-codebook-additional] > .hospitation-codebook-hint");
    if (assessmentHint) contents[4].append(assessmentHint);

    // Keep original wrappers and their listeners. Only emptied groups are hidden.
    // Any future, unmapped field remains visible in the final review step.
    originalGroups.forEach((group) => {
      if (controlsWithin(group).length) contents[4].append(group);
      else group.hidden = true;
    });

    const review = element("div", "hos-steps-review");
    review.append(element("strong", "", "Bereit zum Speichern?"), element("p", "", "Du kannst jeden besuchten Schritt noch einmal öffnen. Gespeichert wird erst mit der abschließenden Aktion."));
    contents[4].append(review);
    const validation = element("p", "hos-steps-validation");
    validation.hidden = true;
    validation.setAttribute("role", "alert");
    const previous = button("action-button hos-steps-previous", "Zurück");
    const next = button("action-button action-button--primary hos-steps-next", "Weiter");
    const spacer = element("span", "hos-steps-actions-spacer");
    spacer.setAttribute("aria-hidden", "true");
    actions.insertBefore(spacer, saveButtons[0]);
    actions.insertBefore(previous, saveButtons[0]);
    actions.insertBefore(next, saveButtons[0]);
    previous.addEventListener("click", () => show(current - 1, { focusHeading: true }));
    next.addEventListener("click", () => {
      if (validatePanel()) show(current + 1, { focusHeading: true });
    });
    form.classList.add("hos-observation-steps");
    actions.classList.add("hos-steps-actions");
    form.prepend(nav, progress, body, validation);
    form.append(actions);

    function show(index, { focusHeading = false } = {}) {
      if (!Number.isInteger(index) || index < 0 || index >= panels.length) return;
      form.querySelectorAll(".observation-field-hint").forEach((hint) => {
        if (hint.matches(":popover-open")) hint.hidePopover();
      });
      current = index;
      furthest = Math.max(furthest, current);
      panels.forEach((panel, panelIndex) => { panel.hidden = panelIndex !== current; });
      stepButtons.forEach((stepButton, buttonIndex) => {
        stepButton.disabled = buttonIndex > furthest;
        stepButton.classList.toggle("is-visited", buttonIndex < furthest);
        if (buttonIndex === current) stepButton.setAttribute("aria-current", "step");
        else stepButton.removeAttribute("aria-current");
      });
      progress.textContent = `Schritt ${current + 1} von ${panels.length}`;
      form.dataset.observationStepCurrent = String(current + 1);
      previous.hidden = current === 0;
      next.hidden = current === panels.length - 1;
      saveButtons.forEach((save) => { save.hidden = current !== panels.length - 1; });
      validation.hidden = true;
      if (focusHeading) {
        headings[current].focus({ preventScroll: true });
        form.closest(".format-participant-body")?.scrollTo({ top: 0, behavior: "instant" });
      }
    }

    function revealInvalid(control) {
      const panel = control.closest("[data-observation-step]");
      if (panel) show(Number(panel.dataset.observationStep));
      for (let ancestor = control.parentElement; ancestor && ancestor !== form; ancestor = ancestor.parentElement) {
        if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
      }
      validation.textContent = control.validationMessage || "Bitte prüfe die markierte Angabe.";
      validation.hidden = false;
      const trigger = control.closest("[data-custom-select]")?.querySelector(".custom-select-trigger");
      const focusTarget = trigger || control;
      focusTarget.focus({ preventScroll: true });
      focusTarget.scrollIntoView({ block: "nearest", behavior: "instant" });
    }

    function validatePanel() {
      const invalid = invalidControl(panels[current]);
      if (!invalid) return true;
      revealInvalid(invalid);
      invalid.reportValidity();
      return false;
    }

    // Native submit validation runs before submit. Reveal its first invalid field
    // synchronously so a required control in another step can receive focus.
    form.addEventListener("invalid", (event) => {
      event.preventDefault();
      const first = invalidControl(form);
      if (first) revealInvalid(first);
    }, true);

    form.addEventListener("submit", (event) => {
      const invalid = invalidControl(form);
      if (invalid || current < panels.length - 1) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (invalid) revealInvalid(invalid);
        else if (validatePanel()) show(current + 1, { focusHeading: true });
      }
    }, true);

    form.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.defaultPrevented || event.isComposing || current === panels.length - 1) return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.closest("[data-custom-select]")) return;
      event.preventDefault();
      if (validatePanel()) show(current + 1, { focusHeading: true });
    });

    const controller = Object.freeze({
      get currentStep() { return current + 1; },
      goToStep(step) {
        const index = Number(step) - 1;
        if (!Number.isInteger(index) || index < 0 || index > furthest) return false;
        if (index > current && !validatePanel()) return false;
        show(index, { focusHeading: true });
        return true;
      }
    });
    mountedForms.set(form, controller);
    show(0);
    return controller;
  }

  function mount(container) {
    if (!container?.querySelectorAll) return [];
    const selector = "form[data-observation-create-form], form[data-observation-edit-form]";
    const forms = container.matches?.(selector) ? [container] : [...container.querySelectorAll(selector)];
    return forms.map(enhance).filter(Boolean);
  }

  window.HospitationObservationSteps = Object.freeze({ mount });
})();
