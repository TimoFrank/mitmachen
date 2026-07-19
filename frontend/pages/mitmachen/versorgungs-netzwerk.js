      (function () {
        "use strict";
        const FORM_VERSION = "mitmachen-network-registration-v2";
        const PROCESSING_CONSENT_VERSION = "network-registration-processing-v2-2026-07-11";
        const CONTACT_CONSENT_VERSION = "network-registration-contact-v2-2026-07-11";
        const PRIVACY_NOTICE_VERSION = "versorgungs-netzwerk-hinweis-v2-2026-07-11";
        const submissionId = window.crypto && typeof window.crypto.randomUUID === "function"
          ? window.crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (character) {
              const random = Math.floor(Math.random() * 16);
              const value = character === "x" ? random : (random & 3) | 8;
              return value.toString(16);
            });
        const form = document.getElementById("registration-form");
        const contactStep = document.getElementById("form-step-contact");
        const profileStep = document.getElementById("form-step-profile");
        const progressContact = document.getElementById("progress-contact");
        const progressProfile = document.getElementById("progress-profile");
        const nextButton = document.getElementById("next-to-profile");
        const backButton = document.getElementById("back-to-contact");
        const minimalButton = document.getElementById("submit-minimal");
        const statusNode = document.getElementById("form-status");
        const confirmation = document.getElementById("confirmation");
        function setStatus(message, type) {
          statusNode.textContent = message || "";
          statusNode.className = "form-status" + (type ? " is-" + type : "");
        }
        function setStep(step) {
          const showProfile = step === 2;
          contactStep.hidden = showProfile;
          profileStep.hidden = !showProfile;
          progressContact.classList.toggle("is-active", !showProfile);
          progressContact.classList.toggle("is-complete", showProfile);
          progressProfile.classList.toggle("is-active", showProfile);
          progressContact.toggleAttribute("aria-current", !showProfile);
          progressProfile.toggleAttribute("aria-current", showProfile);
          setStatus("");
          const target = document.getElementById(showProfile ? "profile-step-title" : "contact-step-title");
          target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
          document.querySelector(".form-card").scrollIntoView({ behavior: "smooth", block: "start" });
        }
        function validateContactStep() {
          const firstInvalid = Array.from(contactStep.querySelectorAll("[required]")).find(function (field) { return !field.checkValidity(); });
          if (!firstInvalid) return true;
          firstInvalid.reportValidity();
          firstInvalid.focus();
          setStatus("Bitte füllen Sie die Pflichtfelder aus und bestätigen Sie die notwendigen Angaben.", "error");
          return false;
        }
        function optionalText(data, name) {
          const value = String(data.get(name) || "").trim();
          return value || null;
        }
        function sourceUrl() {
          return window.location.protocol === "http:" || window.location.protocol === "https:" ? window.location.origin + window.location.pathname : "local-preview";
        }
        function payloadFromForm(onboardingStage) {
          const data = new FormData(form);
          const now = new Date().toISOString();
          const contactConsent = data.get("consent_contact") === "on";
          return {
            submission_id: submissionId,
            submitted_at: now, onboarding_stage: onboardingStage,
            title: optionalText(data, "title"),
            first_name: String(data.get("first_name") || "").trim(),
            last_name: String(data.get("last_name") || "").trim(),
            email: String(data.get("email") || "").trim(),
            professional_group: optionalText(data, "professional_group"),
            role: optionalText(data, "role"),
            employment_status: optionalText(data, "employment_status"),
            years_in_profession_band: optionalText(data, "years_in_profession_band"),
            age_group: optionalText(data, "age_group"),
            organization: optionalText(data, "organization"),
            sector: optionalText(data, "sector"),
            postal_code: optionalText(data, "postal_code"),
            city: optionalText(data, "city"),
            federal_state: optionalText(data, "federal_state"),
            employee_count_band: optionalText(data, "employee_count_band"),
            primary_system_type: optionalText(data, "primary_system_type"),
            primary_system_vendor: optionalText(data, "primary_system_vendor"),
            primary_system_product: optionalText(data, "primary_system_product"),
            ti_applications: data.getAll("ti_applications").map(String),
            participation_formats: data.getAll("participation_formats").map(String),
            interest_topics: data.getAll("interest_topics").map(String),
            message: optionalText(data, "message"),
            eligibility_confirmed_at: now,
            consent_processing_version: PROCESSING_CONSENT_VERSION,
            consent_processing_accepted_at: now,
            consent_contact_version: contactConsent ? CONTACT_CONSENT_VERSION : null,
            consent_contact_accepted_at: contactConsent ? now : null,
            privacy_notice_version: PRIVACY_NOTICE_VERSION,
            form_version: FORM_VERSION,
            language: "de",
            source_url: sourceUrl()
          };
        }
        function transportConfig() {
          const config = window.VERSORGUNGS_COMPASS_CONFIG || {};
          const baseUrl = String(config.apiBaseUrl || "").trim().replace(/\/+$/, "");
          const targetApi = config.dataMode === "api" && config.requireApiGateway === true && /^https:\/\//i.test(baseUrl);
          const demoProfile = config.dataMode === "demo" && config.authMode === "anonymous-demo";
          const demoRuntime = window.VERSORGUNGS_COMPASS_DEMO_RUNTIME;
          const demoAdapter = window.VersorgungsCompassDemoApi;
          const localDemo = demoProfile
            && demoRuntime?.publicDemo === true
            && demoRuntime?.persistence === "memory-only"
            && demoAdapter?.active === true;
          return {
            endpoint: targetApi ? baseUrl + "/api/network-registrations" : localDemo ? window.location.origin + "/api/network-registrations" : "",
            credentials: localDemo ? "same-origin" : config.apiCredentials || "include",
            configured: targetApi || localDemo,
            localDemo: localDemo,
            blockedDemo: demoProfile && !localDemo
          };
        }
        async function postRegistration(payload) {
          const transport = transportConfig();
          if (transport.blockedDemo) {
            const error = new Error("Die lokale Demo ist derzeit nicht verfügbar. Es wurden keine Angaben gesendet.");
            error.code = "DEMO_ADAPTER_UNAVAILABLE";
            throw error;
          }
          if (!transport.configured) throw new Error("Die sichere Übermittlung ist derzeit nicht konfiguriert.");
          const response = await fetch(transport.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            credentials: transport.credentials,
            body: JSON.stringify(payload)
          });
          const responseText = await response.text();
          let responseBody;
          try { responseBody = responseText ? JSON.parse(responseText) : null; }
          catch (_error) { throw new Error("Die Registrierungsantwort war nicht gültig."); }
          if (!response.ok || !responseBody || responseBody.ok !== true) {
            throw new Error(responseBody && typeof responseBody.error === "string" ? responseBody.error : "Die Registrierung konnte gerade nicht sicher übermittelt werden.");
          }
          return responseBody;
        }
        function setSubmitting(value) {
          Array.from(form.querySelectorAll("button")).forEach(function (button) { button.disabled = value; });
          form.setAttribute("aria-busy", value ? "true" : "false");
        }
        async function completeRegistration(stage) {
          setStatus("");
          confirmation.classList.remove("is-visible");
          if (form.elements.company.value) { setStatus("Die Registrierung konnte nicht übermittelt werden.", "error"); return; }
          if (!validateContactStep()) { setStep(1); return; }
          if (!form.checkValidity()) { form.reportValidity(); setStatus("Bitte prüfen Sie die markierten Angaben.", "error"); return; }
          setSubmitting(true);
          setStatus(transportConfig().localDemo ? "Die Demo-Registrierung wird nur lokal simuliert …" : "Ihre Registrierung wird sicher übermittelt …");
          try {
            const result = await postRegistration(payloadFromForm(stage));
            form.reset();
            form.hidden = true;
            document.querySelector(".form-head").hidden = true;
            if (result && result.demo === true) {
              confirmation.querySelector("strong").textContent = "Demo-Registrierung erfolgreich simuliert.";
              confirmation.querySelector("p").textContent = "Es wurden keine Angaben übertragen oder dauerhaft gespeichert. Beim Neuladen wird dieser Eintrag vollständig verworfen.";
            }
            confirmation.classList.add("is-visible");
            confirmation.scrollIntoView({ behavior: "smooth", block: "center" });
          } catch (error) {
            console.error("Registrierung fehlgeschlagen", error);
            setStatus(error?.code === "DEMO_ADAPTER_UNAVAILABLE"
              ? error.message
              : "Die Registrierung konnte gerade nicht übermittelt werden. Bitte versuchen Sie es später erneut.", "error");
          } finally { setSubmitting(false); }
        }
        nextButton.addEventListener("click", function () { if (validateContactStep()) setStep(2); });
        backButton.addEventListener("click", function () { setStep(1); });
        minimalButton.addEventListener("click", function () { completeRegistration("registered"); });
        form.addEventListener("submit", function (event) { event.preventDefault(); completeRegistration("profile_complete"); });
      })();
