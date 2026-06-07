export type GoldenCase = {
  id: string;
  text: string;
  expectedIntent: string;
  notes?: string;
};

export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: "ptp-1",
    text: "Hi, I wanted to let you know I will pay the overdue amount of $1,850 by June 15th. I've spoken with my employer and my paycheck will clear by then.",
    expectedIntent: "promise_to_pay",
    notes: "Explicit promise with date and amount",
  },
  {
    id: "ptp-2",
    text: "I'll send payment on 2026-07-01 for the full $2,200. Please confirm receipt once processed.",
    expectedIntent: "promise_to_pay",
    notes: "ISO date + amount",
  },
  {
    id: "ptp-3",
    text: "Promise to pay $500 on or before July 30. Working extra shifts to cover this.",
    expectedIntent: "promise_to_pay",
    notes: "'promise to pay' keyword + amount",
  },
  {
    id: "dispute-1",
    text: "I believe there is an error on my account. The balance shown is $3,200 more than what I calculated. I need a detailed payment history immediately.",
    expectedIntent: "dispute",
    notes: "Balance dispute",
  },
  {
    id: "dispute-2",
    text: "This is incorrect. I already paid this amount in March and you're showing it as unpaid. Please fix this billing error right away.",
    expectedIntent: "dispute",
    notes: "Billing error dispute",
  },
  {
    id: "hardship-1",
    text: "I recently lost my job and cannot afford the monthly payment right now. I'm applying for unemployment and hope to resume payments in 60-90 days.",
    expectedIntent: "hardship",
    notes: "Job loss hardship",
  },
  {
    id: "hardship-2",
    text: "Due to a medical emergency, my household income has been significantly reduced. I'm struggling to make ends meet and need to discuss forbearance options.",
    expectedIntent: "hardship",
    notes: "Medical hardship",
  },
  {
    id: "wrong-contact-1",
    text: "You have the wrong number. I don't have any mortgage with your company. Please remove my information from your records immediately.",
    expectedIntent: "wrong_contact",
    notes: "Wrong person",
  },
  {
    id: "wrong-contact-2",
    text: "Stop calling me. This is not the borrower's number. I've never heard of this loan. Do not contact this number again.",
    expectedIntent: "wrong_contact",
    notes: "Stop calling",
  },
  {
    id: "renewal-1",
    text: "I would like to discuss options for refinancing my current loan. With rates dropping, I believe I can get a lower interest rate and would like to renew my terms.",
    expectedIntent: "renewal_request",
    notes: "Refinance / renewal request",
  },
  {
    id: "renewal-2",
    text: "My loan is maturing next year and I'd like to extend my loan or negotiate new terms. Please have someone call me.",
    expectedIntent: "renewal_request",
    notes: "Maturity extension",
  },
  {
    id: "other-1",
    text: "Please send me a copy of my original loan documents from when I signed.",
    expectedIntent: "other",
    notes: "Document request — no clear intent from rules",
  },
];
