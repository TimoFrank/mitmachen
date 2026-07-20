      (function () {
        "use strict";
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
        function setSubmitting(value) {
          Array.from(form.querySelectorAll("button")).forEach(function (button) { button.disabled = value; });
          form.setAttribute("aria-busy", value ? "true" : "false");
        }
        function completeDemo() {
          setStatus("");
          confirmation.classList.remove("is-visible");
          if (form.elements.company.value) { setStatus("Die Demo konnte nicht abgeschlossen werden.", "error"); return; }
          if (!validateContactStep()) { setStep(1); return; }
          if (!form.checkValidity()) { form.reportValidity(); setStatus("Bitte prüfen Sie die markierten Angaben.", "error"); return; }
          setSubmitting(true);
          form.reset();
          form.hidden = true;
          document.querySelector(".form-head").hidden = true;
          confirmation.classList.add("is-visible");
          confirmation.scrollIntoView({ behavior: "smooth", block: "center" });
          setSubmitting(false);
        }
        nextButton.addEventListener("click", function () { if (validateContactStep()) setStep(2); });
        backButton.addEventListener("click", function () { setStep(1); });
        minimalButton.addEventListener("click", completeDemo);
        form.addEventListener("submit", function (event) { event.preventDefault(); completeDemo(); });
      })();
