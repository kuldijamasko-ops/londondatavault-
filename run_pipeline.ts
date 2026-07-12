import { runFullPipeline, enrichLeadsWithDirectors } from './src/services/feeds/service';

console.log("═══════════════════════════════════════");
console.log("  LONDONRE DATAVAULT — REAL DATA PIPELINE");
console.log("═══════════════════════════════════════");
console.log("Sources:");
console.log("  • Gazette RSS — insolvency notices");
console.log("  • OpenCorporates — company officers (free, no key)");
console.log("");
console.log("⚠️  Emails are INFERRED (CH doesn't store addresses)");
console.log("   All leads written locked=1 for owner review");
console.log("");

await runFullPipeline();

console.log("\n=== DONE ===");