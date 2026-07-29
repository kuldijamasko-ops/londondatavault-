import { runFullPipeline } from './src/services/feeds/service';

console.log("═══════════════════════════════════════");
console.log("  LONDONRE DATAVAULT — DATA PIPELINE");
console.log("═══════════════════════════════════════");
console.log("Sources:");
console.log("  • Gazette RSS — insolvency notices (real, free)");
console.log("  • data.gov.uk — planning metadata (real, free)");
console.log("  • Buyer leads — manual owner input only");
console.log("");

await runFullPipeline();

console.log("\n=== DONE ===");