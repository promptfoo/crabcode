# Crab Tax Plugin

`crab tax` organizes tax documents, extracts supported fields, computes deterministic 2025 federal and California estimates for supported scenarios, and writes a TurboTax-oriented handoff packet.

## Installation

```bash
crab tax install
```

## Usage

```bash
crab tax ./my-tax-docs
crab tax ./my-tax-docs --output ./tax-output
crab tax ./my-tax-docs --profile ./profile.json
crab tax uninstall
```

## Outputs

The plugin writes:

```text
tax-output/
├── taxpayer_profile.json
├── documents.json
├── extracted/
├── reconciliation.json
├── issues_to_review.json
├── federal_return_inputs.json
├── ca_return_inputs.json
├── estimate_summary.json
└── turbotax_handoff.md
```

## Supported Inputs

- `W-2`
- `1099-INT`
- `1099-DIV`
- `1098`
- `1099-B`
- `1099-R`
- `5498`
- `1099-composite`
- `property-tax-bill`

## Extraction Modes

### Mock Sidecars

For deterministic local tests, place a `.mock.json` file beside the document:

```text
w2-2025.pdf
w2-2025.pdf.mock.json
```

### Deterministic Parsers

The plugin prefers deterministic extraction for supported document layouts such as composite brokerage statements and property tax bills.

### Live OpenAI Extraction

If no mock sidecar is present and deterministic parsing does not apply, the plugin attempts live extraction for supported PDFs and images when `OPENAI_API_KEY` is set. The current default model is `gpt-5.4`.

## Agent Research Loop

For unknown or unsupported tax forms, the plugin runs a bounded agent research pass:

- the agent inspects the unknown document inventory
- it uses tool calls to perform official-source research
- it records a handling strategy
- unsupported forms remain blocking unless deterministic handling exists

This is intentionally different from letting an agent improvise tax math. The deterministic engine still owns reconciliation and final computations.

## Current Supported Scenario

The deterministic estimation path currently targets:

- 2025 tax year
- `single` or `mfj`
- California full-year resident
- no dependent-related federal credits
- no RSU / ESPP / inherited-share handling
- no Schedule C, rental, or K-1 support

Unsupported scenarios are surfaced as blocking issues rather than silently guessed.

## Development

Run fixture-based end-to-end tests:

```bash
cd plugins/tax
npm test
```
