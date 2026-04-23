import { getDatabase, closeDatabase } from "./database.js";
import { Database } from "bun:sqlite";
import { wikiFileManager } from "./wiki/index.js";
import { storage } from "./storage/index.js";
import { storeWikiPageEmbedding } from "./embeddings/index.js";

async function migrateEmbeddings() {
  console.log("=== Migrating embeddings to sqlite-vec ===\n");
  
  const db = getDatabase();
  const sqlite = (db as unknown as { $client: Database }).$client;
  
  const pages = await storage.wikiPages.findAll();
  console.log(`Found ${pages.length} wiki pages\n`);
  
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const page of pages) {
    try {
      const content = wikiFileManager.readPage(page.type, page.slug);
      
      if (!content?.content) {
        console.log(`  [SKIP] ${page.slug} - no content`);
        skipped++;
        continue;
      }
      
      const fullContent = `${page.title}\n${page.summary ?? ""}\n${content.content}`;
      await storeWikiPageEmbedding(page.id, fullContent);
      
      console.log(`  [OK] ${page.slug}`);
      migrated++;
    } catch (error) {
      console.log(`  [FAIL] ${page.slug} - ${(error as Error).message}`);
      failed++;
    }
  }
  
  console.log("\n=== Migration complete ===");
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Failed:   ${failed}`);
  
  const count = sqlite.query<{ count: number }, []>("SELECT COUNT(*) as count FROM wiki_embeddings").get();
  console.log(`\nTotal vectors in wiki_embeddings: ${count?.count ?? 0}`);
  
  closeDatabase();
}

migrateEmbeddings();