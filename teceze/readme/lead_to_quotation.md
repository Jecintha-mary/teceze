# Opportunity & Quotation Sales Process

## Process Flow

```mermaid
flowchart TD

    Start([Lead / Opportunity Created])

    CustomerCheck{Customer Type?}

    ExistingCustomer[Existing Customer]
    NewCustomer[New Customer]

    CreateQuote[Create Quotation]

    PresalesAssessment[Presales Assessment]

    ClarificationCheck{Clarification Needed?}
    RaiseClarification[Presales Raises Clarification Request]
    SalesResponse[Salesperson Responds]

    RiskCheck{Risk Identified?}
    RaiseRisk[Presales Raises Risk Notes]
    Lost([Opportunity Lost])

    subgraph QuotationProcess["Quotation & Approval Process"]
        MultiSupplier[Add Multiple Suppliers for Requirements]
        CheckboxEnable[Enable / Select Preferred Supplier Checkbox]
        IssueQuote[Submit / Issue Quotation]
        ApprovedCheck{Quotation Approved?}
        Success([Process Complete])

        MultiSupplier --> CheckboxEnable
        CheckboxEnable --> IssueQuote
        IssueQuote --> ApprovedCheck
        ApprovedCheck -- No --> CreateQuote
        ApprovedCheck -- Yes --> Success
    end

    Start --> CustomerCheck

    CustomerCheck -- Existing Customer --> ExistingCustomer
    ExistingCustomer --> CreateQuote

    CustomerCheck -- New Customer --> NewCustomer
    NewCustomer --> PresalesAssessment

    PresalesAssessment --> ClarificationCheck
    ClarificationCheck -- Yes --> RaiseClarification
    RaiseClarification --> SalesResponse
    SalesResponse --> PresalesAssessment

    ClarificationCheck -- No --> RiskCheck
    RiskCheck -- Yes --> RaiseRisk
    RaiseRisk --> Lost

    RiskCheck -- No --> CreateQuote

    CreateQuote --> MultiSupplier

    %% ---------- COLORS ----------
    classDef start fill:#2563EB,stroke:#1E40AF,color:#FFFFFF,stroke-width:2px;
    classDef decision fill:#F59E0B,stroke:#B45309,color:#FFFFFF,stroke-width:2px;
    classDef customer fill:#8B5CF6,stroke:#6D28D9,color:#FFFFFF,stroke-width:2px;
    classDef presales fill:#06B6D4,stroke:#0E7490,color:#FFFFFF,stroke-width:2px;
    classDef quotation fill:#10B981,stroke:#047857,color:#FFFFFF,stroke-width:2px;
    classDef approval fill:#F97316,stroke:#C2410C,color:#FFFFFF,stroke-width:2px;
    classDef success fill:#22C55E,stroke:#15803D,color:#FFFFFF,stroke-width:2px;
    classDef lost fill:#EF4444,stroke:#B91C1C,color:#FFFFFF,stroke-width:2px;

    class Start start;
    class CustomerCheck,ClarificationCheck,RiskCheck,ApprovedCheck decision;
    class ExistingCustomer,NewCustomer customer;
    class PresalesAssessment,RaiseClarification,SalesResponse,RiskCheck presales;
    class CreateQuote,MultiSupplier,CheckboxEnable quotation;
    class IssueQuote,ApprovedCheck approval;
    class Success success;
    class Lost,RaiseRisk lost;
```

## Flow Summary

1. **Lead / Opportunity Created**
2. Check **Customer Type**
   - Existing Customer → Create Quotation
   - New Customer → Presales Assessment
3. **Presales Assessment**
   - Clarification Needed?
     - Yes → Presales Raises Clarification Request → Salesperson Responds → Presales Assessment
     - No → Risk Check
4. **Risk Identified?**
   - Yes → Presales Raises Risk Notes → Opportunity Lost
   - No → Create Quotation
5. **Quotation & Approval Process**
   - Add Multiple Suppliers for Requirements
   - Enable / Select Preferred Supplier Checkbox
   - Submit / Issue Quotation
   - Quotation Approved?
     - No → Create Quotation
     - Yes → Process Complete
