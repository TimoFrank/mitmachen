      const frame = document.getElementById("hospitation-documentation-frame");
      const switcherLinks = [...document.querySelectorAll("[data-hospitation-switcher-link]")];

      function setActiveSwitcher(target) {
        let activeLink = null;
        switcherLinks.forEach((link) => {
          const active = link.dataset.hospitationSwitcherLink === target;
          link.classList.toggle("is-active", active);
          if (active) {
            activeLink = link;
            link.setAttribute("aria-current", "page");
          } else {
            link.removeAttribute("aria-current");
          }
        });
        if (activeLink && window.matchMedia("(max-width: 760px)").matches) {
          window.requestAnimationFrame(() => activeLink.scrollIntoView({ block: "nearest", inline: "center" }));
        }
      }

      function switcherTargetFromHash(hash = "") {
        if (hash === "#framework") return "framework";
        if (hash === "#questionnaire") return "questionnaire";
        if (hash === "#hospitations:observations") return "observations";
        if (hash === "#hospitations:patterns") return "patterns";
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
        const activeHospitationPanel = frameDocument.querySelector('[data-hospitation-tab-panel="appointments"]:not([hidden]), [data-hospitation-tab-panel="observations"]:not([hidden]), [data-hospitation-tab-panel="patterns"]:not([hidden]), [data-hospitation-tab-panel="dashboard"]:not([hidden])');
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

      async function addAdminImportLink() {
        const config = window.VERSORGUNGS_COMPASS_CONFIG || {};
        if (config.dataMode !== "api" || !["iap", "oidc"].includes(config.authMode)) return;
        const apiBaseUrl = String(config.apiBaseUrl || "").replace(/\/+$/, "");
        const profileUrl = new URL(`${apiBaseUrl}/api/profile`, window.location.origin);
        if (profileUrl.origin !== window.location.origin) return;
        try {
          const response = await fetch(profileUrl.href, {
            headers: { Accept: "application/json" },
            credentials: config.apiCredentials || "same-origin"
          });
          if (!response.ok) return;
          const profile = await response.json();
          if (String(profile?.role || "").toLowerCase() !== "admin") return;
          const actions = document.querySelector(".hospitation-app-actions");
          if (!actions || actions.querySelector("[data-hospitation-admin-import-link]")) return;
          const link = document.createElement("a");
          link.className = "hospitation-admin-import-link";
          link.href = "./import.html";
          link.dataset.hospitationAdminImportLink = "";
          link.textContent = "Datenübernahme";
          link.title = "Lokalen Staging-Stand geprüft übernehmen";
          actions.append(link);
        } catch {
          // Ohne verifizierbares Admin-Profil bleibt das Werkzeug fail-closed verborgen.
        }
      }

      addAdminImportLink();
