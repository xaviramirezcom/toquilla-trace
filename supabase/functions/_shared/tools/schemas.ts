// Workshop agent tools, part 2: the function declarations sent to Gemini (spec 03 section 6.6).
import { GRADES, PROPOSAL_TYPES, STAGES, STRAWS } from "../domain.ts";
import type { LlmFunctionDeclaration } from "../llm-types.ts";

// ---------------------------------------------------------------------------
// Tool declarations (fixed order, stable text: no dates, names or ids)
// ---------------------------------------------------------------------------

const QUOTE = {
  type: "string",
  description:
    "Exact words copied from the note that support this, 3 to 160 characters, character for character, original language.",
};
const WHY = { type: "string", description: "One plain English sentence explaining this proposal." };
const CONFIDENCE = { type: "string", enum: ["high", "check"] };
const STAGE_ENUM = { type: "string", enum: [...STAGES] };
const GRADE_ENUM = { type: "string", enum: [...GRADES] };
export const FLAG_KINDS = ["grade_mismatch", "too_fast", "weaver_not_found", "other"] as const;

export const TOOLS: LlmFunctionDeclaration[] = [
  {
    name: "find_weaver",
    description:
      "Find weavers of this workshop by a name heard in the note, like 'Rosa', 'Doña Rosa' or 'Manuel Delgado'. Returns every match (0 to 5). Read only.",
    parametersJsonSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Name as heard. Honorifics like Doña are fine." } },
      required: ["name"],
    },
  },
  {
    name: "find_hats",
    description:
      "Find hats of this workshop by codes, by weaver name, or by stage. Give at least one of codes, weaver_name or stage. Codes are matched exactly first, then by common mishearings. Returns up to 20 hats. Read only.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        codes: {
          type: "array",
          items: { type: "string" },
          description: "Hat codes as heard in the note, up to 10.",
        },
        weaver_name: { type: "string", description: "Weaver name as heard, for hats described by weaver." },
        stage: { ...STAGE_ENUM, description: "Only hats at this stage." },
        open_only: {
          type: "boolean",
          description:
            "true (default): skip Finished and archived hats. Use false only if the note is about a finished hat.",
        },
      },
    },
  },
  {
    name: "get_hat",
    description: "Get one hat with its last 10 events and open flags. Use only when you need history. Read only.",
    parametersJsonSchema: {
      type: "object",
      properties: { code: { type: "string", description: "Hat code, like TQ-7F3K2." } },
      required: ["code"],
    },
  },
  {
    name: "propose_create_hats",
    description:
      "Propose creating new hats from one weaver. Does not save anything: a person must approve. weaver_id must come from find_weaver, and find_weaver must have returned exactly one weaver for that name.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        weaver_id: { type: "string" },
        quantity: { type: "integer", description: "1 to 20" },
        grade: { ...GRADE_ENUM, description: "Only if the note says it. Code derives it from rows otherwise." },
        rows_per_inch: { type: "integer", description: "6 to 40, as said in the note (hileras)." },
        straw: { type: "string", enum: [...STRAWS], description: "Only if the note says it." },
        quote: QUOTE,
        why: WHY,
        confidence: CONFIDENCE,
      },
      required: ["weaver_id", "quantity", "rows_per_inch", "quote", "why", "confidence"],
    },
  },
  {
    name: "propose_advance_stage",
    description:
      "Propose moving one hat to the stage the note says. Does not save anything. Code rules decide if the move is allowed; blocked proposals are still shown to the person.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        hat_code: { type: "string", description: "Code exactly as returned by find_hats or get_hat." },
        to_stage: STAGE_ENUM,
        quote: QUOTE,
        why: WHY,
        confidence: CONFIDENCE,
      },
      required: ["hat_code", "to_stage", "quote", "why", "confidence"],
    },
  },
  {
    name: "propose_flag",
    description: "Propose raising a flag on one hat for a person to review. Does not save anything.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        hat_code: { type: "string", description: "Code exactly as returned by find_hats or get_hat." },
        kind: { type: "string", enum: [...FLAG_KINDS] },
        message: { type: "string", description: "Short English text for the flag, up to 200 characters." },
        quote: QUOTE,
        why: WHY,
        confidence: CONFIDENCE,
      },
      required: ["hat_code", "kind", "message", "quote", "why", "confidence"],
    },
  },
  {
    name: "ask_question",
    description:
      "Ask the person a question instead of guessing, for example which weaver or hat is meant, or a missing fact. Creates a question card with a draft of the proposal. Does not save anything.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        proposal_type: { type: "string", enum: [...PROPOSAL_TYPES] },
        question: { type: "string", description: "Short English question, up to 160 characters." },
        choices: {
          type: "array",
          description: "0 to 4 choices taken from lookup results. Empty if nothing was found.",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              weaver_id: { type: "string", description: "A weaver_id returned by find_weaver." },
              hat_code: { type: "string", description: "A code returned by find_hats." },
            },
            required: ["label"],
          },
        },
        draft: {
          type: "object",
          description:
            "What you would propose once the person answers. Copy every fact the note gives (quantity, grade, rows_per_inch, to_stage) so the person only answers the question. Leave out unknown fields.",
          properties: {
            hat_code: { type: "string" },
            quantity: { type: "integer" },
            grade: GRADE_ENUM,
            rows_per_inch: { type: "integer" },
            to_stage: STAGE_ENUM,
            flag_kind: { type: "string", enum: [...FLAG_KINDS] },
          },
        },
        quote: QUOTE,
        why: WHY,
      },
      required: ["proposal_type", "question", "quote", "why"],
    },
  },
];

export const READ_TOOLS = new Set(["find_weaver", "find_hats", "get_hat"]);
