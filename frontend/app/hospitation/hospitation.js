      const frame = document.getElementById("hospitation-documentation-frame");
      const switcherLinks = [...document.querySelectorAll("[data-hospitation-switcher-link]")];

      function setActiveSwitcher(target) {
        switcherLinks.forEach((link) => {
          const active = link.dataset.hospitationSwitcherLink === target;
          link.classList.toggle("is-active", active);
          if (active) {
            link.setAttribute("aria-current", "page");
          } else {
            link.removeAttribute("aria-current");
          }
        });
      }

      function switcherTargetFromHash(hash = "") {
        if (hash === "#framework") return "framework";
        if (hash === "#questionnaire") return "questionnaire";
        if (hash === "#hospitations:observations") return "observations";
        if (hash === "#hospitations:dashboard") return "dashboard";
        return "appointments";
      }

      function prepareHospitationFrame() {
        const frameWindow = frame?.contentWindow;
        const frameDocument = frame?.contentDocument;
        if (!frameWindow || !frameDocument) return false;

        if (!frameWindow.location.hash.startsWith("#hospitations") && !["#framework", "#questionnaire"].includes(frameWindow.location.hash)) {
          frameWindow.location.hash = "hospitations";
        }

        const appShell = frameDocument.querySelector(".app-shell");
        const isStandalone = appShell?.dataset.standaloneModule === "hospitation-documentation";
        const frameworkPanel = frameDocument.querySelector('[data-view-panel="framework"]:not([hidden])');
        const activeHospitationPanel = frameDocument.querySelector('[data-hospitation-tab-panel="appointments"]:not([hidden]), [data-hospitation-tab-panel="observations"]:not([hidden]), [data-hospitation-tab-panel="dashboard"]:not([hidden])');
        const questionnairePanel = frameDocument.querySelector('[data-view-panel="questionnaire"]:not([hidden])');
        setActiveSwitcher(switcherTargetFromHash(frameWindow.location.hash));
        return isStandalone && (appShell?.dataset.activeView === "framework" || appShell?.dataset.activeView === "hospitations" || appShell?.dataset.activeView === "questionnaire" || Boolean(frameworkPanel) || Boolean(activeHospitationPanel) || Boolean(questionnairePanel));
      }

      switcherLinks.forEach((link) => {
        link.addEventListener("click", () => {
          setActiveSwitcher(link.dataset.hospitationSwitcherLink || "appointments");
        });
      });

      frame?.addEventListener("load", () => {
        let attempts = 0;
        const revealWhenReady = () => {
          attempts += 1;
          try {
            if (prepareHospitationFrame() || attempts >= 40) {
              window.setTimeout(() => document.body.classList.add("is-loaded"), 80);
              return;
            }
          } catch (error) {
            if (attempts >= 40) {
              document.body.classList.add("is-loaded");
              return;
            }
          }
          window.setTimeout(revealWhenReady, 80);
        };
        revealWhenReady();
      });
