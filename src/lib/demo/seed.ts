import type { DB } from "@/lib/db";
import { lenders, loans, events, emailClassifications, importRuns } from "@/lib/db/schema";
import { importLoanTape } from "@/lib/import/loan-import";

/**
 * Baseline demo data is embedded as string constants (not read from disk) so the
 * reset endpoint works in a serverless deployment, where files outside the
 * traced function bundle aren't available at runtime. These match the committed
 * `samples/loans-v1.csv` and `samples/loans-beacon.csv` used by the CLI seed.
 */
export const LOANS_V1_CSV = `loan_number,borrower_name,borrower_email,borrower_phone,property_address,original_balance,current_balance,interest_rate,origination_date,maturity_date,status
ACM-2021-001,Margaret Holloway,m.holloway@email.com,555-201-3847,"1420 Birchwood Dr Austin TX 78701",285000,261432.18,0.0385,2021-03-15,2051-03-15,current
ACM-2021-002,Robert Chen,rchen@mailbox.net,555-409-7721,"884 Oak Terrace Dallas TX 75201",425000,398127.50,0.0410,2021-06-01,2051-06-01,current
ACM-2020-003,Sandra Okafor,sokafor@outlook.com,555-318-9900,"2233 Elm Street Houston TX 77002",195000,164720.00,0.0365,2020-09-10,2050-09-10,current
ACM-2022-004,James Thornton,,555-512-4488,"73 Riverside Blvd San Antonio TX 78201",550000,532890.00,0.0425,2022-01-20,2052-01-20,delinquent
ACM-2019-005,Linda Vasquez,lvasquez@gmails.com,555-634-0021,"4901 Pecan Grove Ln Plano TX 75023",320000,267441.33,0.0345,2019-04-05,2049-04-05,current
ACM-2023-006,David Park,dpark@techcorp.io,555-788-1234,"16 Sunset Ridge Ct Fort Worth TX 76101",675000,661200.00,0.0475,2023-02-14,2053-02-14,current
ACM-2021-007,Natalie Freeman,,555-210-6677,"308 Magnolia Ave Corpus Christi TX 78401",178000,149832.75,0.0390,2021-11-30,2051-11-30,in_forbearance
ACM-2018-008,Thomas Wright,twright1962@yahoo.com,555-901-2345,"5550 Bluebonnet Way Lubbock TX 79401",240000,184500.00,0.0330,2018-07-22,2048-07-22,current
ACM-2022-009,Emily Nguyen,emily.n@designstudio.com,555-456-7890,"2814 Cedar Crest Dr Amarillo TX 79101",395000,381200.00,0.0445,2022-08-01,2052-08-01,current
ACM-2020-010,Carlos Rivera,crivera@biz.net,555-321-0987,"909 Mockingbird Ln Waco TX 76701",210000,172600.00,0.0375,2020-02-28,2050-02-28,delinquent
`;

export const LOANS_BEACON_CSV = `loan_number,borrower_name,borrower_email,borrower_phone,property_address,original_balance,current_balance,interest_rate,origination_date,maturity_date,status
BCN-2022-001,Alicia Moreno,a.moreno@homenet.com,555-100-2222,"3320 Lakeview Dr Phoenix AZ 85001",340000,318900.00,0.0395,2022-05-01,2052-05-01,current
BCN-2021-002,Frederick Hayes,fhayes@retiremail.net,555-200-4444,"88 Canyon Rd Tucson AZ 85701",290000,251600.00,0.0360,2021-02-14,2051-02-14,current
BCN-2023-003,Monique Dubois,m.dubois@artgallery.org,555-300-6666,"1975 Desert Rose Blvd Scottsdale AZ 85251",720000,712000.00,0.0490,2023-07-01,2053-07-01,current
BCN-2020-004,William Santos,,555-400-8888,"514 Palo Verde Way Mesa AZ 85201",185000,148320.00,0.0340,2020-01-15,2050-01-15,delinquent
BCN-2022-005,Rachel Goldstein,rgold@lawfirm.com,555-500-1111,"2601 Saguaro Pass Chandler AZ 85224",560000,541200.00,0.0430,2022-10-20,2052-10-20,current
`;

export type SeedSummary = {
  acmeLoans: number;
  beaconLoans: number;
};

/**
 * Reset the demo to a known baseline: wipe all loan-derived data, then re-import
 * the two seed tapes. Idempotent — safe to run repeatedly. Tables are cleared in
 * FK-safe order (children before parents). Lenders are upserted, not deleted.
 */
export async function seedDemoData(db: DB): Promise<SeedSummary> {
  await db.delete(events);
  await db.delete(emailClassifications);
  await db.delete(importRuns);
  await db.delete(loans);

  await db
    .insert(lenders)
    .values([
      { id: "acme-mortgage", name: "Acme Mortgage Corp" },
      { id: "beacon-lending", name: "Beacon Lending LLC" },
    ])
    .onConflictDoNothing();

  const acme = await importLoanTape(db, LOANS_V1_CSV, "loans-v1.csv", "acme-mortgage");
  const beacon = await importLoanTape(db, LOANS_BEACON_CSV, "loans-beacon.csv", "beacon-lending");

  return { acmeLoans: acme.inserted, beaconLoans: beacon.inserted };
}
