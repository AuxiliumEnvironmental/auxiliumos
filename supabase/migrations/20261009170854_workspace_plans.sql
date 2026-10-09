begin;

-- Personal synthetic preparation only. Existing submit_request authorizes no
-- professional, commercial, document-release, message-send or Moldo transition.
-- No grant or owner-onboarding guard is changed by this additive migration.

-- Frozen typed catalogue from module-screen-definitions.ts at bd090fe, with
-- the owner-directed Facility coordinator terminology applied before deployment.
-- Runtime field additions require a reviewed additive schema migration.
create function private.workspace_plan_schema(p_module_key text,p_panel_key text)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select case when schema->>'module_key'=p_module_key then schema else null end
  from (select $catalogue${
  "scope.1": {
    "module_key": "scope",
    "fields": [
      {
        "label": "Project request reference",
        "kind": "text"
      },
      {
        "label": "Facility / area",
        "kind": "text"
      },
      {
        "label": "Inclusions",
        "kind": "multiline"
      },
      {
        "label": "Exclusions",
        "kind": "multiline"
      },
      {
        "label": "Assumptions",
        "kind": "multiline"
      },
      {
        "label": "Limitations",
        "kind": "multiline"
      },
      {
        "label": "Sampling decision",
        "kind": "multiline"
      },
      {
        "label": "Accepted recommendations",
        "kind": "multiline"
      },
      {
        "label": "Declined recommendations",
        "kind": "multiline"
      }
    ],
    "row_fields": [
      {
        "label": "Deliverable",
        "kind": "text"
      },
      {
        "label": "Acceptance evidence",
        "kind": "text"
      }
    ],
    "checks": []
  },
  "scope.2": {
    "module_key": "scope",
    "fields": [
      {
        "label": "Scope revision reference",
        "kind": "text"
      },
      {
        "label": "Qualified reviewer",
        "kind": "text"
      },
      {
        "label": "Current revision notes",
        "kind": "multiline"
      },
      {
        "label": "Proposed revision notes",
        "kind": "multiline"
      },
      {
        "label": "Review notes",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": [
      "Confirm the exact scope revision",
      "Review inclusions and exclusions",
      "Identify unresolved assumptions",
      "Separate sampling and commercial authority"
    ]
  },
  "scope.3": {
    "module_key": "scope",
    "fields": [
      {
        "label": "Current approved revision",
        "kind": "text"
      },
      {
        "label": "Requested change",
        "kind": "multiline"
      },
      {
        "label": "Reason for change",
        "kind": "multiline"
      },
      {
        "label": "Work affected",
        "kind": "multiline"
      },
      {
        "label": "Schedule and cost considerations",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "projects.1": {
    "module_key": "projects",
    "fields": [
      {
        "label": "Project reference",
        "kind": "text"
      },
      {
        "label": "Authorization reference",
        "kind": "text"
      },
      {
        "label": "Scope revision",
        "kind": "text"
      },
      {
        "label": "Facility",
        "kind": "text"
      },
      {
        "label": "Accountable owner",
        "kind": "text"
      },
      {
        "label": "Handoff notes",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "projects.2": {
    "module_key": "projects",
    "fields": [
      {
        "label": "Project reference",
        "kind": "text"
      },
      {
        "label": "Scheduling constraints",
        "kind": "multiline"
      }
    ],
    "row_fields": [
      {
        "label": "Work order title",
        "kind": "text"
      },
      {
        "label": "Assigned person",
        "kind": "text"
      },
      {
        "label": "Facility / area",
        "kind": "text"
      },
      {
        "label": "Planned date",
        "kind": "date"
      },
      {
        "label": "Permitted instructions",
        "kind": "multiline"
      }
    ],
    "checks": []
  },
  "projects.3": {
    "module_key": "projects",
    "fields": [
      {
        "label": "Project reference",
        "kind": "text"
      },
      {
        "label": "Accountable reviewer",
        "kind": "text"
      },
      {
        "label": "Handoff evidence",
        "kind": "multiline"
      },
      {
        "label": "Exceptions and outstanding work",
        "kind": "multiline"
      },
      {
        "label": "Review notes",
        "kind": "multiline"
      }
    ],
    "row_fields": [
      {
        "label": "Deliverable reference",
        "kind": "text"
      },
      {
        "label": "Evidence reference",
        "kind": "text"
      }
    ],
    "checks": [
      "Required deliverables identified",
      "Work order evidence reviewed",
      "Exceptions recorded",
      "Client handoff prepared"
    ]
  },
  "programs.1": {
    "module_key": "programs",
    "fields": [
      {
        "label": "Program name",
        "kind": "text"
      },
      {
        "label": "Client account reference",
        "kind": "text"
      },
      {
        "label": "MSA reference",
        "kind": "text"
      }
    ],
    "row_fields": [
      {
        "label": "Facility reference",
        "kind": "text"
      },
      {
        "label": "Coverage description",
        "kind": "text"
      },
      {
        "label": "Activation date",
        "kind": "date"
      }
    ],
    "checks": []
  },
  "programs.2": {
    "module_key": "programs",
    "fields": [
      {
        "label": "Program revision",
        "kind": "text"
      },
      {
        "label": "Effective from",
        "kind": "date"
      },
      {
        "label": "Effective until",
        "kind": "date"
      },
      {
        "label": "Period notes",
        "kind": "multiline"
      }
    ],
    "row_fields": [
      {
        "label": "Facility reference",
        "kind": "text"
      },
      {
        "label": "Start date",
        "kind": "date"
      },
      {
        "label": "End date",
        "kind": "date"
      }
    ],
    "checks": []
  },
  "programs.3": {
    "module_key": "programs",
    "fields": [
      {
        "label": "MSA revision",
        "kind": "text"
      },
      {
        "label": "Rate card reference",
        "kind": "text"
      },
      {
        "label": "Commercial authority",
        "kind": "text"
      },
      {
        "label": "Current revision notes",
        "kind": "multiline"
      },
      {
        "label": "Proposed revision notes",
        "kind": "multiline"
      },
      {
        "label": "Review notes",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": [
      "Confirm effective agreement revision",
      "Check covered facilities",
      "Review response expectations",
      "Confirm commercial authority"
    ]
  },
  "portfolios.1": {
    "module_key": "portfolios",
    "fields": [
      {
        "label": "Portfolio name",
        "kind": "text"
      },
      {
        "label": "Client account reference",
        "kind": "text"
      },
      {
        "label": "Regional grouping",
        "kind": "text"
      },
      {
        "label": "Portfolio notes",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "portfolios.2": {
    "module_key": "portfolios",
    "fields": [
      {
        "label": "Portfolio reference",
        "kind": "text"
      }
    ],
    "row_fields": [
      {
        "label": "Facility reference",
        "kind": "text"
      },
      {
        "label": "Regional grouping",
        "kind": "text"
      },
      {
        "label": "Relationship notes",
        "kind": "text"
      }
    ],
    "checks": []
  },
  "portfolios.3": {
    "module_key": "portfolios",
    "fields": [
      {
        "label": "Portfolio reference",
        "kind": "text"
      },
      {
        "label": "Approved audience",
        "kind": "text"
      },
      {
        "label": "Period start",
        "kind": "date"
      },
      {
        "label": "Period end",
        "kind": "date"
      },
      {
        "label": "Reporting questions",
        "kind": "multiline"
      },
      {
        "label": "Released source references",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "readiness.1": {
    "module_key": "readiness",
    "fields": [
      {
        "label": "Facility reference",
        "kind": "text"
      },
      {
        "label": "Facility coordinator",
        "kind": "text"
      },
      {
        "label": "Accountable contact",
        "kind": "text"
      },
      {
        "label": "Response map",
        "kind": "multiline"
      },
      {
        "label": "Access information",
        "kind": "multiline"
      }
    ],
    "row_fields": [
      {
        "label": "Asset reference",
        "kind": "text"
      },
      {
        "label": "Area",
        "kind": "text"
      },
      {
        "label": "Operational context",
        "kind": "text"
      }
    ],
    "checks": []
  },
  "readiness.2": {
    "module_key": "readiness",
    "fields": [
      {
        "label": "Facility reference",
        "kind": "text"
      },
      {
        "label": "Reviewer",
        "kind": "text"
      },
      {
        "label": "Evidence references",
        "kind": "multiline"
      },
      {
        "label": "Review notes",
        "kind": "multiline"
      }
    ],
    "row_fields": [
      {
        "label": "Deficiency",
        "kind": "text"
      },
      {
        "label": "Accountable owner",
        "kind": "text"
      },
      {
        "label": "Due date",
        "kind": "date"
      },
      {
        "label": "Evidence / next action",
        "kind": "multiline"
      }
    ],
    "checks": [
      "Site contacts reviewed",
      "Access information reviewed",
      "Response map reviewed",
      "Critical asset information reviewed"
    ]
  },
  "readiness.3": {
    "module_key": "readiness",
    "fields": [
      {
        "label": "Facility reference",
        "kind": "text"
      }
    ],
    "row_fields": [
      {
        "label": "Activity",
        "kind": "text"
      },
      {
        "label": "Accountable owner",
        "kind": "text"
      },
      {
        "label": "Recurrence notes",
        "kind": "text"
      },
      {
        "label": "Next planned date",
        "kind": "date"
      }
    ],
    "checks": []
  },
  "estimates.1": {
    "module_key": "estimates",
    "fields": [
      {
        "label": "Scope revision",
        "kind": "text"
      },
      {
        "label": "Currency",
        "kind": "text"
      },
      {
        "label": "Planning range lower",
        "kind": "money"
      },
      {
        "label": "Planning range upper",
        "kind": "money"
      }
    ],
    "row_fields": [
      {
        "label": "Description",
        "kind": "text"
      },
      {
        "label": "Unit",
        "kind": "text"
      },
      {
        "label": "Quantity",
        "kind": "quantity"
      },
      {
        "label": "Planning unit amount",
        "kind": "money"
      }
    ],
    "checks": []
  },
  "estimates.2": {
    "module_key": "estimates",
    "fields": [
      {
        "label": "Estimate revision",
        "kind": "text"
      },
      {
        "label": "Labor basis",
        "kind": "multiline"
      },
      {
        "label": "Direct cost basis",
        "kind": "multiline"
      },
      {
        "label": "Travel assumptions",
        "kind": "multiline"
      },
      {
        "label": "Uncertainty and exclusions",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "estimates.3": {
    "module_key": "estimates",
    "fields": [
      {
        "label": "Estimate revision",
        "kind": "text"
      },
      {
        "label": "Recommended cap reference",
        "kind": "text"
      },
      {
        "label": "Granted cap reference",
        "kind": "text"
      },
      {
        "label": "Commercial reviewer",
        "kind": "text"
      },
      {
        "label": "Current revision notes",
        "kind": "multiline"
      },
      {
        "label": "Proposed revision notes",
        "kind": "multiline"
      },
      {
        "label": "Review notes",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": [
      "Confirm estimate basis",
      "Review planning uncertainty",
      "Separate recommended and granted caps",
      "Confirm spending authority"
    ]
  },
  "approvals.1": {
    "module_key": "approvals",
    "fields": [
      {
        "label": "Agreement reference",
        "kind": "text"
      },
      {
        "label": "Scope revision",
        "kind": "text"
      },
      {
        "label": "Authorized signer",
        "kind": "text"
      },
      {
        "label": "Payer",
        "kind": "text"
      },
      {
        "label": "Terms reference",
        "kind": "multiline"
      },
      {
        "label": "Rate basis reference",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "approvals.2": {
    "module_key": "approvals",
    "fields": [
      {
        "label": "Agreement revision",
        "kind": "text"
      },
      {
        "label": "Scope revision",
        "kind": "text"
      },
      {
        "label": "Signer reference",
        "kind": "text"
      },
      {
        "label": "Payer reference",
        "kind": "text"
      },
      {
        "label": "Current revision notes",
        "kind": "multiline"
      },
      {
        "label": "Proposed revision notes",
        "kind": "multiline"
      },
      {
        "label": "Review notes",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": [
      "Read exact agreement revision",
      "Verify signer authority",
      "Confirm payer and commercial basis",
      "Check effective amendments"
    ]
  },
  "approvals.3": {
    "module_key": "approvals",
    "fields": [
      {
        "label": "Effective agreement revision",
        "kind": "text"
      },
      {
        "label": "Change authorization reference",
        "kind": "text"
      },
      {
        "label": "Proposed amendment",
        "kind": "multiline"
      },
      {
        "label": "Reason",
        "kind": "multiline"
      },
      {
        "label": "Affected terms",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "sampling.1": {
    "module_key": "sampling",
    "fields": [
      {
        "label": "Scope revision",
        "kind": "text"
      },
      {
        "label": "Facility / area",
        "kind": "text"
      },
      {
        "label": "Qualified reviewer",
        "kind": "text"
      },
      {
        "label": "Sampling strategy",
        "kind": "multiline"
      },
      {
        "label": "Professional review questions",
        "kind": "multiline"
      }
    ],
    "row_fields": [
      {
        "label": "Location reference",
        "kind": "text"
      },
      {
        "label": "Sample identifier",
        "kind": "text"
      },
      {
        "label": "Method reference",
        "kind": "text"
      }
    ],
    "checks": []
  },
  "sampling.2": {
    "module_key": "sampling",
    "fields": [
      {
        "label": "Sampling plan revision",
        "kind": "text"
      }
    ],
    "row_fields": [
      {
        "label": "Sample identifier",
        "kind": "text"
      },
      {
        "label": "From custodian",
        "kind": "text"
      },
      {
        "label": "To custodian",
        "kind": "text"
      },
      {
        "label": "Transfer date",
        "kind": "date"
      },
      {
        "label": "Transfer evidence",
        "kind": "multiline"
      }
    ],
    "checks": []
  },
  "sampling.3": {
    "module_key": "sampling",
    "fields": [
      {
        "label": "Sampling plan revision",
        "kind": "text"
      },
      {
        "label": "Laboratory report reference",
        "kind": "text"
      },
      {
        "label": "Qualified reviewer",
        "kind": "text"
      },
      {
        "label": "Current revision notes",
        "kind": "multiline"
      },
      {
        "label": "Proposed revision notes",
        "kind": "multiline"
      },
      {
        "label": "Review notes",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": [
      "Check sample identification",
      "Review custody evidence",
      "Keep laboratory results distinct from interpretation",
      "Record professional interpretation separately"
    ]
  },
  "messages.1": {
    "module_key": "messages",
    "fields": [
      {
        "label": "Linked record reference",
        "kind": "text"
      },
      {
        "label": "Recipient reference",
        "kind": "text"
      },
      {
        "label": "Subject",
        "kind": "text"
      },
      {
        "label": "Communication route",
        "kind": "select",
        "options": [
          "Technical",
          "Billing",
          "Scheduling",
          "Urgent",
          "Vendor"
        ]
      },
      {
        "label": "Message",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "messages.2": {
    "module_key": "messages",
    "fields": [
      {
        "label": "Conversation reference",
        "kind": "text"
      },
      {
        "label": "Responsible person",
        "kind": "text"
      },
      {
        "label": "Request type",
        "kind": "select",
        "options": [
          "Question",
          "Clarification",
          "Task",
          "Change request draft"
        ]
      },
      {
        "label": "Request",
        "kind": "multiline"
      },
      {
        "label": "Requested response date",
        "kind": "date"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "messages.3": {
    "module_key": "messages",
    "fields": [
      {
        "label": "Linked record reference",
        "kind": "text"
      },
      {
        "label": "Technical contact",
        "kind": "multiline"
      },
      {
        "label": "Billing contact",
        "kind": "multiline"
      },
      {
        "label": "Scheduling contact",
        "kind": "multiline"
      },
      {
        "label": "Urgent escalation contact",
        "kind": "multiline"
      },
      {
        "label": "Vendor contact",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "vendors.1": {
    "module_key": "vendors",
    "fields": [
      {
        "label": "Work order reference",
        "kind": "text"
      },
      {
        "label": "Vendor reference",
        "kind": "text"
      },
      {
        "label": "Accountable contact",
        "kind": "text"
      }
    ],
    "row_fields": [
      {
        "label": "Assignment title",
        "kind": "text"
      },
      {
        "label": "Due date",
        "kind": "date"
      },
      {
        "label": "Permitted instructions",
        "kind": "multiline"
      }
    ],
    "checks": []
  },
  "vendors.2": {
    "module_key": "vendors",
    "fields": [
      {
        "label": "Assignment reference",
        "kind": "text"
      },
      {
        "label": "Completion evidence",
        "kind": "multiline"
      },
      {
        "label": "Exceptions",
        "kind": "multiline"
      },
      {
        "label": "Review notes",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": [
      "Assigned instructions reviewed",
      "Required evidence identified",
      "Exceptions recorded"
    ]
  },
  "vendors.3": {
    "module_key": "vendors",
    "fields": [
      {
        "label": "Vendor reference",
        "kind": "text"
      },
      {
        "label": "Company name",
        "kind": "text"
      }
    ],
    "row_fields": [
      {
        "label": "Credential type",
        "kind": "text"
      },
      {
        "label": "Evidence reference",
        "kind": "text"
      },
      {
        "label": "Expiry date",
        "kind": "date"
      }
    ],
    "checks": []
  },
  "finance.1": {
    "module_key": "finance",
    "fields": [
      {
        "label": "Authorization reference",
        "kind": "text"
      },
      {
        "label": "Source transaction reference",
        "kind": "text"
      },
      {
        "label": "Currency",
        "kind": "text"
      },
      {
        "label": "Record basis",
        "kind": "select",
        "options": [
          "Commitment",
          "Incurred cost"
        ]
      },
      {
        "label": "Amount",
        "kind": "money"
      },
      {
        "label": "Entry notes",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "finance.2": {
    "module_key": "finance",
    "fields": [
      {
        "label": "Invoice reference",
        "kind": "text"
      },
      {
        "label": "Payer reference",
        "kind": "text"
      },
      {
        "label": "Source transaction reference",
        "kind": "text"
      },
      {
        "label": "Currency",
        "kind": "text"
      },
      {
        "label": "Invoice amount",
        "kind": "money"
      },
      {
        "label": "Invoice date",
        "kind": "date"
      },
      {
        "label": "Review notes",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "finance.3": {
    "module_key": "finance",
    "fields": [
      {
        "label": "Reserve record reference",
        "kind": "text"
      },
      {
        "label": "Source transaction reference",
        "kind": "text"
      },
      {
        "label": "Permitted export audience",
        "kind": "text"
      },
      {
        "label": "Export purpose",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "reports.1": {
    "module_key": "reports",
    "fields": [
      {
        "label": "Report name",
        "kind": "text"
      },
      {
        "label": "Metric definition",
        "kind": "text"
      },
      {
        "label": "Denominator definition",
        "kind": "text"
      },
      {
        "label": "Period start",
        "kind": "date"
      },
      {
        "label": "Period end",
        "kind": "date"
      },
      {
        "label": "Source references",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "reports.2": {
    "module_key": "reports",
    "fields": [
      {
        "label": "Package title",
        "kind": "text"
      },
      {
        "label": "Approved audience",
        "kind": "text"
      },
      {
        "label": "Period start",
        "kind": "date"
      },
      {
        "label": "Period end",
        "kind": "date"
      },
      {
        "label": "Review questions",
        "kind": "multiline"
      }
    ],
    "row_fields": [
      {
        "label": "Section title",
        "kind": "text"
      },
      {
        "label": "Released source reference",
        "kind": "text"
      },
      {
        "label": "Next action",
        "kind": "text"
      }
    ],
    "checks": []
  },
  "reports.3": {
    "module_key": "reports",
    "fields": [
      {
        "label": "Definition name",
        "kind": "text"
      },
      {
        "label": "Calculation definition",
        "kind": "multiline"
      },
      {
        "label": "Denominator",
        "kind": "multiline"
      },
      {
        "label": "Source records",
        "kind": "multiline"
      },
      {
        "label": "Missing-value handling",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "ai.1": {
    "module_key": "ai",
    "fields": [
      {
        "label": "Linked record reference",
        "kind": "text"
      },
      {
        "label": "Question",
        "kind": "multiline"
      }
    ],
    "row_fields": [
      {
        "label": "Source reference",
        "kind": "text"
      },
      {
        "label": "Exact revision",
        "kind": "text"
      }
    ],
    "checks": []
  },
  "ai.2": {
    "module_key": "ai",
    "fields": [
      {
        "label": "Assistance request reference",
        "kind": "text"
      },
      {
        "label": "Source citation references",
        "kind": "text"
      },
      {
        "label": "Reviewer",
        "kind": "text"
      },
      {
        "label": "Current revision notes",
        "kind": "multiline"
      },
      {
        "label": "Proposed revision notes",
        "kind": "multiline"
      },
      {
        "label": "Review notes",
        "kind": "multiline"
      }
    ],
    "row_fields": [],
    "checks": [
      "Verify source access and exact revisions",
      "Check citations",
      "Review suggested wording",
      "Keep professional and commercial decisions separate"
    ]
  },
  "audit.1": {
    "module_key": "audit",
    "fields": [
      {
        "label": "Object reference",
        "kind": "text"
      },
      {
        "label": "Actor reference",
        "kind": "text"
      },
      {
        "label": "Operation",
        "kind": "text"
      },
      {
        "label": "From date",
        "kind": "date"
      },
      {
        "label": "To date",
        "kind": "date"
      }
    ],
    "row_fields": [],
    "checks": []
  },
  "audit.2": {
    "module_key": "audit",
    "fields": [
      {
        "label": "Correlation UUID",
        "kind": "text"
      },
      {
        "label": "Object reference",
        "kind": "text"
      }
    ],
    "row_fields": [],
    "checks": []
  }
}$catalogue$::jsonb->p_panel_key schema) entry
$$;

create function private.workspace_plan_text_safe(p_value text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select p_value !~* '(://|www\.|(^|[^a-z])(data:|javascript:)|-----BEGIN|sb_secret_|sb_publishable_|sk_live_|sk_test_|access_token=|refresh_token=|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.)'
$$;

create function private.validate_workspace_plan_fields(p_values jsonb, p_fields jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare item record; field jsonb; value text; kind text;
begin
  if jsonb_typeof(p_values) is distinct from 'object' then
    raise exception 'invalid_planning_draft' using errcode='22023';
  end if;
  for item in select entry.key,entry.value from jsonb_each(p_values) entry loop
    select f into field from jsonb_array_elements(p_fields) f where f->>'label'=item.key;
    if not found or jsonb_typeof(item.value) is distinct from 'string' then
      raise exception 'invalid_planning_draft' using errcode='22023';
    end if;
    value:=item.value#>>'{}'; kind:=coalesce(field->>'kind','text');
    if length(value)>(case when kind='multiline' then 4000 else 500 end)
      or not private.workspace_plan_text_safe(value) then
      raise exception 'invalid_planning_draft' using errcode='22023';
    end if;
    if value='' then continue; end if;
    if kind='date' then
      if value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'invalid_planning_draft' using errcode='22023';
      end if;
      begin
        if to_char(value::date,'YYYY-MM-DD')<>value then
          raise exception 'invalid_planning_draft' using errcode='22023';
        end if;
      exception when invalid_datetime_format or datetime_field_overflow then
        raise exception 'invalid_planning_draft' using errcode='22023';
      end;
    elsif kind='money' and value !~ '^-?[0-9]{1,12}(\.[0-9]{1,2})?$' then
      raise exception 'invalid_planning_draft' using errcode='22023';
    elsif kind='quantity' and value !~ '^-?[0-9]{1,12}(\.[0-9]{1,6})?$' then
      raise exception 'invalid_planning_draft' using errcode='22023';
    elsif kind='select' and not (field->'options' ? value) then
      raise exception 'invalid_planning_draft' using errcode='22023';
    end if;
  end loop;
end;
$$;

create function private.validate_workspace_plan_content(p_module_key text,p_panel_key text,
  p_title text,p_values jsonb,p_rows jsonb,p_checks jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare schema jsonb:=private.workspace_plan_schema(p_module_key,p_panel_key); row_value jsonb; item record;
begin
  if schema is null or p_title is null or p_title<>btrim(p_title) or length(p_title) not between 1 and 120
    or not private.workspace_plan_text_safe(p_title)
    or jsonb_typeof(p_values) is distinct from 'object'
    or jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_typeof(p_checks) is distinct from 'object' then
    raise exception 'invalid_planning_draft' using errcode='22023';
  end if;
  if jsonb_array_length(p_rows)>50
    or octet_length(p_values::text)+octet_length(p_rows::text)+octet_length(p_checks::text)>65536
    or (jsonb_array_length(schema->'row_fields')=0 and jsonb_array_length(p_rows)>0) then
    raise exception 'invalid_planning_draft' using errcode='22023';
  end if;
  perform private.validate_workspace_plan_fields(p_values,schema->'fields');
  for row_value in select value from jsonb_array_elements(p_rows) loop
    perform private.validate_workspace_plan_fields(row_value,schema->'row_fields');
  end loop;
  for item in select key,value from jsonb_each(p_checks) loop
    if not (schema->'checks' ? item.key) or jsonb_typeof(item.value) is distinct from 'boolean' then
      raise exception 'invalid_planning_draft' using errcode='22023';
    end if;
  end loop;
end;
$$;

create table private.workspace_plans (
  id uuid primary key,
  account_id uuid not null references public.client_accounts(id),
  facility_id uuid not null,
  creator_profile_id uuid not null references public.user_profiles(id),
  creator_auth_user_id uuid not null,
  module_key text not null,
  panel_key text not null,
  revision integer not null default 0 check(revision>=0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  is_demo boolean not null default true check(is_demo),
  foreign key(facility_id,account_id) references public.facilities(id,account_id),
  foreign key(account_id,creator_profile_id) references public.account_access(account_id,user_profile_id),
  unique(id,creator_profile_id,creator_auth_user_id),
  check(private.workspace_plan_schema(module_key,panel_key) is not null)
);
create index workspace_plans_personal_panel_idx on private.workspace_plans
  (creator_profile_id,account_id,facility_id,module_key,panel_key,updated_at desc,id desc);
create index workspace_plans_account_idx on private.workspace_plans(account_id);
create index workspace_plans_facility_idx on private.workspace_plans(facility_id,account_id);

create table private.workspace_plan_revisions (
  plan_id uuid not null,
  revision integer not null check(revision>=1),
  creator_profile_id uuid not null,
  creator_auth_user_id uuid not null,
  request_id uuid not null,
  title text not null,
  values jsonb not null,
  rows jsonb not null,
  checks jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(plan_id,revision),
  unique(creator_profile_id,request_id),
  foreign key(plan_id,creator_profile_id,creator_auth_user_id)
    references private.workspace_plans(id,creator_profile_id,creator_auth_user_id)
);
alter table private.workspace_plans enable row level security;
alter table private.workspace_plan_revisions enable row level security;
revoke all on private.workspace_plans,private.workspace_plan_revisions from public,anon,authenticated,service_role;

-- Preserve every existing event family; add only personal draft revision events.
alter table public.audit_events drop constraint audit_events_access_event_scope_check,
  add constraint audit_events_access_event_scope_check check (
    (actor_kind='legacy_fixture' and account_id is not null)
    or (actor_kind in ('user','system') and object_id is not null and is_internal_only and (
      (account_id is null and object_type='user_profile' and event_type in ('profile_created','profile_updated','profile_deleted'))
      or (account_id is not null and object_type='account_access' and event_type in ('account_access_created','account_access_updated','account_access_deleted'))
      or (account_id is not null and object_type='account_capability_grant' and event_type in ('capability_grant_created','capability_grant_updated','capability_grant_revoked','capability_grant_restored','capability_grant_deleted'))
      or (account_id is not null and actor_kind='user' and is_demo and (
        (object_type='incident' and event_type='incident_created')
        or (object_type='project_request' and event_type in ('request_created','request_submitted','request_assigned','request_reclassified','request_status_changed'))
        or (object_type='request_response' and event_type='missing_information_received')))
      or (account_id is not null and object_type='private_object' and is_demo and (
        (actor_kind='user' and event_type in ('private_object_reserved','private_object_upload_claimed','private_object_finalized','private_object_ingest_closed'))
        or (actor_kind='system' and event_type in ('private_object_upload_claimed','private_object_upload_received','private_object_failed','private_object_scan_claimed','private_object_restriction_changed','private_object_hold_changed','private_object_ingest_closed'))
        or event_type='private_object_phi_suspected'))
      or (account_id is not null and is_demo and actor_kind='system' and (
        (object_type='private_object_grant' and event_type in ('private_object_grant_created','private_object_grant_revoked'))
        or (object_type='private_object_scan' and event_type='private_object_scan_recorded')
        or (object_type='document_version_grant' and event_type in ('document_version_grant_created','document_version_grant_revoked'))))
      or (account_id is not null and is_demo and actor_kind='user' and object_type='private_object_clearance' and event_type='private_object_clearance_recorded')
      or (account_id is not null and is_demo and actor_kind='user' and object_type='document_version' and event_type='document_version_adopted')
      or (account_id is null and object_type='private_object_reservation_config' and event_type in ('private_object_reservation_config_created','private_object_reservation_config_updated') and actor_kind='system' and is_demo)
      or (account_id is not null and is_demo and actor_kind='user' and object_type='document_content_authorization' and event_type='document_content_authorized')
      or (account_id is not null and is_demo and actor_kind='system' and object_type='document_content_grant' and event_type in ('document_content_grant_created','document_content_grant_revoked'))
      or (account_id is not null and is_demo and actor_kind='system' and object_type='document_content_result' and event_type='document_content_result_recorded')
      or (is_demo and actor_kind='system' and object_type='document_content_attempt' and event_type='document_content_denied')
      or (account_id is null and is_demo and actor_kind='system' and object_type='document_content_config' and event_type in ('document_content_config_created','document_content_config_updated'))
      or (account_id is not null and is_demo and actor_kind='user' and object_type='workspace_plan'
        and event_type in ('workspace_plan_created','workspace_plan_revised'))
    ))
  );

create function private.lock_workspace_plan_author(p_profile uuid,p_auth uuid,p_account uuid,p_facility uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if not private.lock_intake_profile(p_profile,p_account,p_facility,'submit_request')
    or not exists(select 1 from public.user_profiles where id=p_profile and auth_user_id=p_auth) then
    raise exception 'planning_draft_unavailable' using errcode='42501';
  end if;
end;
$$;

create function private.guard_workspace_plan_head()
returns trigger language plpgsql security invoker set search_path='' as $$
declare actor uuid; profile uuid;
begin
  if tg_op in ('DELETE','TRUNCATE') then
    raise exception 'Planning history is immutable' using errcode='55000';
  end if;
  actor:=private.intake_authenticated_subject(); profile:=private.current_subject_id();
  if new.creator_profile_id<>profile or new.creator_auth_user_id<>actor or not new.is_demo then
    raise exception 'planning_draft_unavailable' using errcode='42501';
  end if;
  perform private.lock_workspace_plan_author(profile,actor,new.account_id,new.facility_id);
  if tg_op='INSERT' then
    if new.revision<>0 then raise exception 'invalid_planning_draft' using errcode='22023'; end if;
    new.created_at:=clock_timestamp(); new.updated_at:=new.created_at;
  elsif tg_op='UPDATE' then
    if (to_jsonb(new)-array['revision','updated_at']) is distinct from
       (to_jsonb(old)-array['revision','updated_at']) or new.revision<>old.revision+1
       or not exists(select 1 from private.workspace_plan_revisions r where r.plan_id=new.id and r.revision=new.revision) then
      raise exception 'Planning history is immutable' using errcode='55000';
    end if;
    select r.created_at into new.updated_at from private.workspace_plan_revisions r
      where r.plan_id=new.id and r.revision=new.revision;
  end if;
  return new;
end;
$$;

create function private.guard_workspace_plan_revision()
returns trigger language plpgsql security invoker set search_path='' as $$
declare plan private.workspace_plans%rowtype; actor uuid; profile uuid;
begin
  if tg_op<>'INSERT' then raise exception 'Planning history is immutable' using errcode='55000'; end if;
  actor:=private.intake_authenticated_subject(); profile:=private.current_subject_id();
  select * into plan from private.workspace_plans where id=new.plan_id for update;
  if not found or plan.creator_profile_id<>profile or plan.creator_auth_user_id<>actor
    or new.creator_profile_id<>profile or new.creator_auth_user_id<>actor then
    raise exception 'planning_draft_unavailable' using errcode='42501';
  end if;
  perform private.lock_workspace_plan_author(profile,actor,plan.account_id,plan.facility_id);
  if new.revision<>plan.revision+1 then raise exception 'planning_draft_conflict' using errcode='40001'; end if;
  perform private.validate_workspace_plan_content(plan.module_key,plan.panel_key,new.title,new.values,new.rows,new.checks);
  new.created_at:=clock_timestamp();
  return new;
end;
$$;

create function private.audit_workspace_plan_revision()
returns trigger language plpgsql security definer set search_path='' as $$
declare plan private.workspace_plans%rowtype; actor uuid:=private.intake_authenticated_subject();
begin
  if tg_table_schema<>'private' or tg_table_name<>'workspace_plan_revisions' or tg_op<>'INSERT'
    or tg_when<>'AFTER' or tg_level<>'ROW' then
    raise exception 'Unsupported planning audit context' using errcode='55000';
  end if;
  select * into strict plan from private.workspace_plans where id=new.plan_id;
  if new.creator_auth_user_id<>actor or new.creator_profile_id<>private.current_subject_id() then
    raise exception 'planning_draft_unavailable' using errcode='42501';
  end if;
  insert into public.audit_events(account_id,actor_user_profile_id,actor_kind,actor_auth_user_id,
    object_type,object_id,event_type,event_metadata,occurred_at,correlation_id,is_internal_only,is_demo)
  values(plan.account_id,new.creator_profile_id,'user',actor,'workspace_plan',plan.id,
    case when new.revision=1 then 'workspace_plan_created' else 'workspace_plan_revised' end,
    jsonb_build_object('facility_id',plan.facility_id,'module_key',plan.module_key,'panel_key',plan.panel_key,
      'revision',new.revision,'previous_revision',new.revision-1,'request_id',new.request_id,
      'state','planning_draft','meaning','personal_synthetic_preparation'),
    new.created_at,new.request_id,true,true);
  return null;
end;
$$;
create trigger workspace_plans_guard before insert or update or delete on private.workspace_plans
  for each row execute function private.guard_workspace_plan_head();
create trigger workspace_plans_no_truncate before truncate on private.workspace_plans
  for each statement execute function private.guard_workspace_plan_head();
create trigger workspace_plan_revisions_guard before insert or update or delete on private.workspace_plan_revisions
  for each row execute function private.guard_workspace_plan_revision();
create trigger workspace_plan_revisions_no_truncate before truncate on private.workspace_plan_revisions
  for each statement execute function private.guard_workspace_plan_revision();
create trigger workspace_plan_revisions_audit after insert on private.workspace_plan_revisions
  for each row execute function private.audit_workspace_plan_revision();

create function private.workspace_plan_snapshot(p_plan private.workspace_plans,p_revision private.workspace_plan_revisions)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('id',p_plan.id,'account_id',p_plan.account_id,'facility_id',p_plan.facility_id,
    'module_key',p_plan.module_key,'panel_key',p_plan.panel_key,'title',p_revision.title,'revision',p_revision.revision,
    'values',p_revision.values,'rows',p_revision.rows,'checks',p_revision.checks,
    'created_at',p_plan.created_at,'updated_at',p_revision.created_at,'is_demo',true,'state','planning_draft')
$$;

create function private.save_workspace_plan(p_plan_id uuid,p_account_id uuid,p_facility_id uuid,
  p_module_key text,p_panel_key text,p_expected_revision integer,p_request_id uuid,p_title text,
  p_values jsonb,p_rows jsonb,p_checks jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.intake_authenticated_subject(); profile uuid:=private.current_subject_id();
  plan private.workspace_plans%rowtype; receipt private.workspace_plan_revisions%rowtype;
begin
  perform private.lock_workspace_plan_author(profile,actor,p_account_id,p_facility_id);
  if p_plan_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision<0
    or p_expected_revision>=2147483647 then raise exception 'invalid_planning_draft' using errcode='22023'; end if;
  perform private.validate_workspace_plan_content(p_module_key,p_panel_key,p_title,p_values,p_rows,p_checks);
  -- Author request keys serialize across plans; then one global plan key makes
  -- concurrent creation deterministic without leaking another author's receipt.
  perform pg_advisory_xact_lock(hashtextextended('workspace-plan-author:'||profile::text,0));
  perform pg_advisory_xact_lock(hashtextextended('workspace-plan:'||p_plan_id::text,0));
  select * into plan from private.workspace_plans where id=p_plan_id for update;
  if found and (plan.creator_profile_id<>profile or plan.creator_auth_user_id<>actor
    or plan.account_id<>p_account_id or plan.facility_id<>p_facility_id
    or plan.module_key<>p_module_key or plan.panel_key<>p_panel_key) then
    raise exception 'planning_draft_unavailable' using errcode='42501';
  end if;
  select * into receipt from private.workspace_plan_revisions
    where creator_profile_id=profile and request_id=p_request_id;
  if found then
    if receipt.creator_auth_user_id<>actor or receipt.plan_id<>p_plan_id
      or receipt.revision<>p_expected_revision+1 or receipt.title<>p_title
      or receipt.values is distinct from p_values or receipt.rows is distinct from p_rows
      or receipt.checks is distinct from p_checks then
      raise exception 'planning_draft_conflict' using errcode='40001';
    end if;
    return private.workspace_plan_snapshot(plan,receipt);
  end if;
  if plan.id is null then
    if p_expected_revision<>0 then raise exception 'planning_draft_unavailable' using errcode='42501'; end if;
    insert into private.workspace_plans(id,account_id,facility_id,creator_profile_id,creator_auth_user_id,module_key,panel_key)
    values(p_plan_id,p_account_id,p_facility_id,profile,actor,p_module_key,p_panel_key) returning * into plan;
  elsif plan.revision<>p_expected_revision then
    raise exception 'planning_draft_conflict' using errcode='40001';
  end if;
  insert into private.workspace_plan_revisions(plan_id,revision,creator_profile_id,creator_auth_user_id,
    request_id,title,values,rows,checks)
  values(plan.id,plan.revision+1,profile,actor,p_request_id,p_title,p_values,p_rows,p_checks) returning * into receipt;
  update private.workspace_plans set revision=receipt.revision where id=plan.id returning * into plan;
  return private.workspace_plan_snapshot(plan,receipt);
end;
$$;

create function private.get_workspace_plan(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.intake_authenticated_subject(); profile uuid:=private.current_subject_id();
  plan private.workspace_plans%rowtype; content private.workspace_plan_revisions%rowtype;
begin
  select * into plan from private.workspace_plans
    where id=p_plan_id and creator_profile_id=profile and creator_auth_user_id=actor;
  if not found then raise exception 'planning_draft_unavailable' using errcode='42501'; end if;
  perform private.lock_workspace_plan_author(profile,actor,plan.account_id,plan.facility_id);
  select * into plan from private.workspace_plans where id=p_plan_id for share;
  select * into strict content from private.workspace_plan_revisions where plan_id=plan.id and revision=plan.revision;
  return private.workspace_plan_snapshot(plan,content);
end;
$$;

create function private.list_workspace_plans(p_account_id uuid,p_facility_id uuid,p_module_key text,p_panel_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.intake_authenticated_subject(); profile uuid:=private.current_subject_id(); result jsonb;
begin
  perform private.lock_workspace_plan_author(profile,actor,p_account_id,p_facility_id);
  if private.workspace_plan_schema(p_module_key,p_panel_key) is null then
    raise exception 'invalid_planning_draft' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(item order by updated_at desc,id desc),'[]'::jsonb) into result from (
    select private.workspace_plan_snapshot(p,r)-array['values','rows','checks'] item,p.updated_at,p.id
    from private.workspace_plans p join private.workspace_plan_revisions r on r.plan_id=p.id and r.revision=p.revision
    where p.creator_profile_id=profile and p.creator_auth_user_id=actor and p.account_id=p_account_id
      and p.facility_id=p_facility_id and p.module_key=p_module_key and p.panel_key=p_panel_key
    order by p.updated_at desc,p.id desc limit 100
  ) summaries;
  return result;
end;
$$;

create function public.save_workspace_plan(p_plan_id uuid,p_account_id uuid,p_facility_id uuid,
  p_module_key text,p_panel_key text,p_expected_revision integer,p_request_id uuid,p_title text,
  p_values jsonb,p_rows jsonb,p_checks jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.save_workspace_plan(p_plan_id,p_account_id,p_facility_id,p_module_key,p_panel_key,
    p_expected_revision,p_request_id,p_title,p_values,p_rows,p_checks)
$$;
create function public.get_workspace_plan(p_plan_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.get_workspace_plan(p_plan_id)
$$;
create function public.list_workspace_plans(p_account_id uuid,p_facility_id uuid,p_module_key text,p_panel_key text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.list_workspace_plans(p_account_id,p_facility_id,p_module_key,p_panel_key)
$$;

revoke all on function private.workspace_plan_schema(text,text),private.workspace_plan_text_safe(text),
  private.validate_workspace_plan_fields(jsonb,jsonb),private.validate_workspace_plan_content(text,text,text,jsonb,jsonb,jsonb),
  private.lock_workspace_plan_author(uuid,uuid,uuid,uuid),private.guard_workspace_plan_head(),
  private.guard_workspace_plan_revision(),private.audit_workspace_plan_revision(),
  private.workspace_plan_snapshot(private.workspace_plans,private.workspace_plan_revisions),
  private.save_workspace_plan(uuid,uuid,uuid,text,text,integer,uuid,text,jsonb,jsonb,jsonb),
  private.get_workspace_plan(uuid),private.list_workspace_plans(uuid,uuid,text,text),
  public.save_workspace_plan(uuid,uuid,uuid,text,text,integer,uuid,text,jsonb,jsonb,jsonb),
  public.get_workspace_plan(uuid),public.list_workspace_plans(uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function private.save_workspace_plan(uuid,uuid,uuid,text,text,integer,uuid,text,jsonb,jsonb,jsonb),
  private.get_workspace_plan(uuid),private.list_workspace_plans(uuid,uuid,text,text),
  public.save_workspace_plan(uuid,uuid,uuid,text,text,integer,uuid,text,jsonb,jsonb,jsonb),
  public.get_workspace_plan(uuid),public.list_workspace_plans(uuid,uuid,text,text) to authenticated;

commit;
