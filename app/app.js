const viewData = {
    simple: {
      title: "Simple Project Portal",
      subtitle:
        "Static client-facing concept for simple project/document clients using demo data only.",
      metrics: [
        ["3", "Demo active projects"],
        ["2", "Released-document placeholders"],
        ["0", "Real approvals or signatures"],
      ],
      sections: {
        dashboard: {
          title: "Dashboard",
          description:
            "Simple project overview with static cards. No backend status exists.",
          rows: [
            ["Project A-1001", "Water Intrusion Demo", "Demo status only"],
            ["Project A-1002", "Document Review Demo", "Placeholder"],
          ],
        },
        facilities: {
          title: "Facilities",
          description:
            "Simple clients may have one property placeholder. No real address or facility data is used.",
          rows: [["Demo Property", "Single-site placeholder", "No real address"]],
        },
        requests: {
          title: "Requests / Incident Request",
          description:
            "Static incident request placeholder. Submitting work is not implemented.",
          rows: [["Water Intrusion Demo", "Draft placeholder", "No submission logic"]],
        },
        adminQueue: {
          title: "Admin Queue",
          description:
            "Client view does not control admin intake. This is a placeholder surface only.",
          rows: [["Not client-controlled", "Auxilium review placeholder", "No workflow"]],
        },
        documents: {
          title: "Documents",
          description:
            "Document Placeholder 001 is demo-only. No client-visible document without release workflow.",
          rows: [
            ["Document Placeholder 001", "Released-demo badge", "No file storage"],
            ["Draft Placeholder", "Internal by default", "Hidden rule shown only"],
          ],
        },
        documentRelease: {
          title: "Document Release Queue",
          description:
            "Release workflow is not implemented. This placeholder only shows the future control area.",
          rows: [["Release Requested Demo", "Not actionable", "No approval authority"]],
        },
        clientView: {
          title: "Client View",
          description:
            "Client-visible area placeholder. No real document, report, or technical conclusion exists.",
          rows: [["Released View Placeholder", "Demo only", "No download logic"]],
        },
        auditEvents: {
          title: "Audit Events",
          description:
            "Future audit events will track important actions. This shell has no audit backend.",
          rows: [["Viewed demo dashboard", "Placeholder event", "No persistence"]],
        },
        account: {
          title: "Account",
          description:
            "Demo account settings placeholder. No identity, role, billing, or approval data exists.",
          rows: [["Demo Property Group", "Fake account", "No real users"]],
        },
      },
    },
    enterprise: {
      title: "Enterprise Facility Portal",
      subtitle:
        "Static facility/portfolio concept for enterprise clients using fake data only.",
      metrics: [
        ["4", "Demo facilities"],
        ["2", "Incident placeholders"],
        ["0", "Real PHI records"],
      ],
      sections: {
        dashboard: {
          title: "Dashboard",
          description:
            "Enterprise dashboard concept with fake portfolio status cards only.",
          rows: [
            ["Harbor Portfolio", "Demo portfolio", "No real client data"],
            ["North Wing Facility", "Facility placeholder", "No PHI"],
          ],
        },
        facilities: {
          title: "Facilities",
          description:
            "Facility list placeholder. No real addresses, departments, patients, or operations data.",
          rows: [
            ["North Wing Facility", "Demo active", "No real address"],
            ["South Wing Facility", "Demo monitoring", "No real address"],
            ["Harbor Site", "Demo readiness", "No real address"],
          ],
        },
        requests: {
          title: "Requests / Incident Request",
          description:
            "Enterprise incident placeholder for future facility-linked intake.",
          rows: [
            ["Water Intrusion Demo", "North Wing Facility", "No submission logic"],
            ["IAQ Concern Demo", "Harbor Site", "No technical conclusion"],
          ],
        },
        adminQueue: {
          title: "Admin Queue",
          description:
            "Admin queue belongs to internal users. Enterprise users see status placeholders only.",
          rows: [["Auxilium Review Pending", "Static label", "No workflow"]],
        },
        documents: {
          title: "Documents",
          description:
            "Facility document placeholders. Draft/internal documents remain hidden by default.",
          rows: [
            ["Document Placeholder 001", "Released-demo badge", "No file storage"],
            ["Site Passport Placeholder", "Future concept", "No real facility data"],
          ],
        },
        documentRelease: {
          title: "Document Release Queue",
          description:
            "Document release is a future controlled workflow, not implemented here.",
          rows: [["Release Control Placeholder", "Future workflow", "No authority"]],
        },
        clientView: {
          title: "Client View",
          description:
            "Enterprise client view placeholder for future role-aware facility access.",
          rows: [["Facility Summary Demo", "Role-aware later", "No RLS yet"]],
        },
        auditEvents: {
          title: "Audit Events",
          description:
            "Future audit events will record releases, views, downloads, status changes, and permission changes.",
          rows: [["Facility viewed", "Placeholder event", "No persistence"]],
        },
        account: {
          title: "Account",
          description:
            "Enterprise account placeholder. No billing, signer, role, or real user authority is implemented.",
          rows: [["Demo Enterprise Account", "Fake account", "No real users"]],
        },
      },
    },
    admin: {
      title: "Internal Admin Command Center",
      subtitle:
        "Static Auxilium internal command concept with no backend authority or workflow.",
      metrics: [
        ["5", "Queue placeholders"],
        ["3", "Document-control placeholders"],
        ["0", "Real approvals"],
      ],
      sections: {
        dashboard: {
          title: "Dashboard",
          description:
            "Internal overview placeholder for intake, documents, requests, and audit readiness.",
          rows: [
            ["Intake Queue Demo", "Static", "No assignments"],
            ["Document Release Demo", "Static", "No release authority"],
          ],
        },
        facilities: {
          title: "Facilities",
          description:
            "Internal facility management placeholder. No real facility data is stored.",
          rows: [["North Wing Facility", "Demo facility", "No real address"]],
        },
        requests: {
          title: "Requests / Incident Request",
          description:
            "Admin review placeholder for future incident/request intake.",
          rows: [
            ["Water Intrusion Demo", "Review placeholder", "No status transition"],
            ["Odor Concern Demo", "Needs info placeholder", "No technical review"],
          ],
        },
        adminQueue: {
          title: "Admin Queue",
          description:
            "Static queue for future intake review. No task assignment or workflow exists.",
          rows: [
            ["Request Intake", "Demo pending", "No action"],
            ["Technical Review", "Demo queue", "No professional conclusion"],
            ["Safety Review", "Demo queue", "No authority"],
          ],
        },
        documents: {
          title: "Documents",
          description:
            "Internal document placeholders. No upload, storage, classification, or release exists.",
          rows: [
            ["Document Placeholder 001", "Classification placeholder", "No file"],
            ["Draft Report Placeholder", "Internal by default", "No release"],
          ],
        },
        documentRelease: {
          title: "Document Release Queue",
          description:
            "Future controlled release queue. Buttons are disabled because no authority exists.",
          rows: [
            ["Release Requested Demo", "Disabled", "No document release logic"],
            ["Final Review Demo", "Disabled", "No professional signoff"],
          ],
        },
        clientView: {
          title: "Client View",
          description:
            "Preview placeholder for future client-visible state. No client access exists.",
          rows: [["Released View Preview", "Static only", "No permissions"]],
        },
        auditEvents: {
          title: "Audit Events",
          description:
            "Future audit-event area. No immutable event log exists in this static shell.",
          rows: [
            ["Request submitted", "Future audit event", "Not implemented"],
            ["Document released", "Future audit event", "Not implemented"],
            ["Permission changed", "Future audit event", "Not implemented"],
          ],
        },
        account: {
          title: "Account",
          description:
            "Internal account/admin placeholder. No real account, user, role, signer, or billing authority exists.",
          rows: [["Demo Property Group", "Fake account", "No authority"]],
        },
      },
    },
  };
  
  const state = {
    view: "simple",
    section: "dashboard",
  };
  
  const contentRoot = document.querySelector("#content-root");
  const viewTitle = document.querySelector("[data-testid='view-title']");
  const navItems = Array.from(document.querySelectorAll(".nav-item"));
  const viewButtons = Array.from(document.querySelectorAll(".view-button"));
  
  function setActiveView(view) {
    state.view = view;
    state.section = "dashboard";
    render();
  }
  
  function setActiveSection(section) {
    state.section = section;
    render();
  }
  
  function renderMetrics(metrics) {
    return metrics
      .map(
        ([value, label]) => `
          <article class="status-card">
            <strong>${value}</strong>
            <span>${label}</span>
          </article>
        `,
      )
      .join("");
  }
  
  function renderRows(rows) {
    return rows
      .map(
        ([name, status, note]) => `
          <div class="table-row">
            <strong>${name}</strong>
            <span class="badge">${status}</span>
            <span>${note}</span>
          </div>
        `,
      )
      .join("");
  }
  
  function render() {
    const activeView = viewData[state.view];
    const activeSection = activeView.sections[state.section];
  
    viewTitle.textContent = activeView.title;
  
    viewButtons.forEach((button) => {
      const isActive = button.dataset.view === state.view;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  
    navItems.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.section === state.section);
    });
  
    contentRoot.innerHTML = `
      <section class="section-card">
        <p class="eyebrow">Active view</p>
        <h2>${activeView.title}</h2>
        <p class="subtle">${activeView.subtitle}</p>
        <div class="card-grid">
          ${renderMetrics(activeView.metrics)}
        </div>
      </section>
  
      <section class="section-card">
        <p class="eyebrow">Placeholder surface</p>
        <h2 data-testid="section-title">${activeSection.title}</h2>
        <p class="subtle">${activeSection.description}</p>
  
        <div class="table-list">
          ${renderRows(activeSection.rows)}
        </div>
  
        <button class="placeholder-button" type="button" disabled>
          Placeholder only — no action, no backend, no authority
        </button>
      </section>
  
      <section class="empty-state">
        <p class="eyebrow">Empty state</p>
        <h3>Future workflow not implemented</h3>
        <span>
          This shell is intentionally static. Future issues must separately authorize app code,
          schema, auth, storage, RLS, Playwright tests, document release logic, audit events,
          and any real client workflow.
        </span>
      </section>
    `;
  }
  
  navItems.forEach((button) => {
    button.addEventListener("click", () => setActiveSection(button.dataset.section));
  });
  
  viewButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.view));
  });
  
  render();