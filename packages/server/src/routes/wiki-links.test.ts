import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase } from "../index.js";
import { storage } from "../storage/index.js";
import Fastify from "fastify";
import { registerWikiLinkRoutes } from "./wiki-links.js";
import { registerWikiPageRoutes } from "./wiki-pages.js";

let testDbDir: string;
let testDbPath: string;
let fastify: ReturnType<typeof Fastify>;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-wiki-links-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);

  fastify = Fastify({ logger: false });
  await registerWikiLinkRoutes(fastify);
  await registerWikiPageRoutes(fastify);
});

afterEach(async () => {
  closeDatabase();
  if (existsSync(testDbDir)) {
    rmSync(testDbDir, { recursive: true, force: true });
  }
});

async function createWikiPage(
  slug: string,
  title: string,
  type: "entity" | "concept" | "source" | "summary"
): Promise<string> {
  const page = await storage.wikiPages.create({
    slug,
    title,
    type,
    contentPath: `/wiki/${type}/${slug}.md`,
  });
  return page.id;
}

async function createWikiLink(fromId: string, toId: string, relationType: string): Promise<string> {
  const link = await storage.wikiLinks.create({
    fromPageId: fromId,
    toPageId: toId,
    relationType,
  });
  return link.id;
}

describe("Wiki Links Routes", () => {
  describe("GET /api/wiki-links/graph", () => {
    it("should return empty graph when no pages exist", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.nodes).toEqual([]);
      expect(body.data.edges).toEqual([]);
      expect(body.data.stats.totalPages).toBe(0);
      expect(body.data.stats.totalLinks).toBe(0);
      expect(body.data.stats.orphanCount).toBe(0);
      expect(body.data.stats.hubCount).toBe(0);
    });

    it("should return graph with isolated pages (orphans)", async () => {
      await createWikiPage("page-1", "Page One", "concept");
      await createWikiPage("page-2", "Page Two", "entity");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body.data.nodes.length).toBe(2);
      expect(body.data.edges.length).toBe(0);
      expect(body.data.stats.totalPages).toBe(2);
      expect(body.data.stats.orphanCount).toBe(2);
      
      for (const node of body.data.nodes) {
        expect(node.isOrphan).toBe(true);
        expect(node.isHub).toBe(false);
        expect(node.incomingLinks).toBe(0);
        expect(node.outgoingLinks).toBe(0);
      }
    });

    it("should return graph with connected pages", async () => {
      const page1 = await createWikiPage("source", "Source Page", "source");
      const page2 = await createWikiPage("target", "Target Page", "concept");
      await createWikiLink(page1, page2, "reference");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data.nodes.length).toBe(2);
      expect(body.data.edges.length).toBe(1);
      expect(body.data.stats.totalLinks).toBe(1);
      expect(body.data.stats.orphanCount).toBe(0);

      const sourceNode = body.data.nodes.find((n: { slug: string }) => n.slug === "source");
      const targetNode = body.data.nodes.find((n: { slug: string }) => n.slug === "target");

      expect(sourceNode.outgoingLinks).toBe(1);
      expect(sourceNode.incomingLinks).toBe(0);
      expect(targetNode.incomingLinks).toBe(1);
      expect(targetNode.outgoingLinks).toBe(0);
    });

    it("should identify hub pages with 3+ connections", async () => {
      const hubPage = await createWikiPage("hub", "Hub Page", "concept");
      const page1 = await createWikiPage("page-1", "Page One", "entity");
      const page2 = await createWikiPage("page-2", "Page Two", "entity");
      const page3 = await createWikiPage("page-3", "Page Three", "source");

      await createWikiLink(hubPage, page1, "reference");
      await createWikiLink(hubPage, page2, "reference");
      await createWikiLink(hubPage, page3, "reference");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data.stats.hubCount).toBe(1);

      const hubNode = body.data.nodes.find((n: { slug: string }) => n.slug === "hub");
      expect(hubNode.isHub).toBe(true);
      expect(hubNode.outgoingLinks).toBe(3);
    });

    it("should identify hub pages with 3+ incoming links", async () => {
      const hubPage = await createWikiPage("popular", "Popular Page", "concept");
      const page1 = await createWikiPage("ref-1", "Reference 1", "entity");
      const page2 = await createWikiPage("ref-2", "Reference 2", "entity");
      const page3 = await createWikiPage("ref-3", "Reference 3", "source");

      await createWikiLink(page1, hubPage, "reference");
      await createWikiLink(page2, hubPage, "reference");
      await createWikiLink(page3, hubPage, "reference");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data.stats.hubCount).toBe(1);

      const popularNode = body.data.nodes.find((n: { slug: string }) => n.slug === "popular");
      expect(popularNode.isHub).toBe(true);
      expect(popularNode.incomingLinks).toBe(3);
    });

    it("should include edge information with relation types", async () => {
      const page1 = await createWikiPage("from", "From Page", "concept");
      const page2 = await createWikiPage("to", "To Page", "entity");
      await createWikiLink(page1, page2, "related");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data.edges.length).toBe(1);
      expect(body.data.edges[0].from).toBe(page1);
      expect(body.data.edges[0].to).toBe(page2);
      expect(body.data.edges[0].relationType).toBe("related");
    });

    it("should handle bidirectional links", async () => {
      const page1 = await createWikiPage("page-a", "Page A", "concept");
      const page2 = await createWikiPage("page-b", "Page B", "concept");

      await createWikiLink(page1, page2, "reference");
      await createWikiLink(page2, page1, "reference");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data.edges.length).toBe(2);
      expect(body.data.stats.totalLinks).toBe(2);

      const nodeA = body.data.nodes.find((n: { slug: string }) => n.slug === "page-a");
      const nodeB = body.data.nodes.find((n: { slug: string }) => n.slug === "page-b");

      expect(nodeA.incomingLinks).toBe(1);
      expect(nodeA.outgoingLinks).toBe(1);
      expect(nodeB.incomingLinks).toBe(1);
      expect(nodeB.outgoingLinks).toBe(1);
    });

    it("should include all required node properties", async () => {
      await createWikiPage("test-node", "Test Node", "summary");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const node = body.data.nodes[0];
      expect(node.id).toBeDefined();
      expect(node.slug).toBe("test-node");
      expect(node.title).toBe("Test Node");
      expect(node.type).toBe("summary");
      expect(node.incomingLinks).toBeDefined();
      expect(node.outgoingLinks).toBeDefined();
      expect(node.isOrphan).toBeDefined();
      expect(node.isHub).toBeDefined();
    });

    it("should include all required edge properties", async () => {
      const page1 = await createWikiPage("edge-from", "Edge From", "concept");
      const page2 = await createWikiPage("edge-to", "Edge To", "entity");
      await createWikiLink(page1, page2, "cites");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const edge = body.data.edges[0];
      expect(edge.id).toBeDefined();
      expect(edge.from).toBeDefined();
      expect(edge.to).toBeDefined();
      expect(edge.relationType).toBeDefined();
    });

    it("should handle complex graph with multiple connections", async () => {
      const central = await createWikiPage("central", "Central Hub", "concept");
      const relatedPages: string[] = [];
      
      for (let i = 0; i < 5; i++) {
        const pageId = await createWikiPage(`related-${i}`, `Related ${i}`, "entity");
        relatedPages.push(pageId);
        await createWikiLink(central, pageId, "reference");
      }

      for (let i = 0; i < 3; i++) {
        await createWikiLink(relatedPages[i], central, "backlink");
      }

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data.nodes.length).toBe(6);
      expect(body.data.edges.length).toBe(8);
      expect(body.data.stats.hubCount).toBe(1);

      const centralNode = body.data.nodes.find((n: { slug: string }) => n.slug === "central");
      expect(centralNode.isHub).toBe(true);
      expect(centralNode.outgoingLinks).toBe(5);
      expect(centralNode.incomingLinks).toBe(3);
    });
  });

  describe("GET /api/wiki-links/from/:pageId", () => {
    it("should return 404 for non-existent page", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/from/non-existent-id",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Wiki page not found");
    });

    it("should return empty array for page with no outgoing links", async () => {
      const pageId = await createWikiPage("isolated", "Isolated Page", "concept");

      const response = await fastify.inject({
        method: "GET",
        url: `/api/wiki-links/from/${pageId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual([]);
    });

    it("should return outgoing links for page", async () => {
      const sourceId = await createWikiPage("source", "Source Page", "source");
      const target1Id = await createWikiPage("target-1", "Target One", "concept");
      const target2Id = await createWikiPage("target-2", "Target Two", "entity");

      await createWikiLink(sourceId, target1Id, "reference");
      await createWikiLink(sourceId, target2Id, "related");

      const response = await fastify.inject({
        method: "GET",
        url: `/api/wiki-links/from/${sourceId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body.data.length).toBe(2);
      
      const link1 = body.data.find((l: { toPageId: string }) => l.toPageId === target1Id);
      expect(link1.relationType).toBe("reference");
      
      const link2 = body.data.find((l: { toPageId: string }) => l.toPageId === target2Id);
      expect(link2.relationType).toBe("related");
    });

    it("should include all link properties", async () => {
      const sourceId = await createWikiPage("link-source", "Link Source", "concept");
      const targetId = await createWikiPage("link-target", "Link Target", "entity");
      await createWikiLink(sourceId, targetId, "cites");

      const response = await fastify.inject({
        method: "GET",
        url: `/api/wiki-links/from/${sourceId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const link = body.data[0];
      expect(link.id).toBeDefined();
      expect(link.fromPageId).toBe(sourceId);
      expect(link.toPageId).toBe(targetId);
      expect(link.relationType).toBe("cites");
      expect(link.createdAt).toBeDefined();
    });
  });

  describe("GET /api/wiki-links/to/:pageId", () => {
    it("should return 404 for non-existent page", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/to/non-existent-id",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Wiki page not found");
    });

    it("should return empty array for page with no incoming links", async () => {
      const pageId = await createWikiPage("no-incoming", "No Incoming Page", "concept");

      const response = await fastify.inject({
        method: "GET",
        url: `/api/wiki-links/to/${pageId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual([]);
    });

    it("should return incoming links for page", async () => {
      const targetId = await createWikiPage("target", "Target Page", "concept");
      const source1Id = await createWikiPage("source-1", "Source One", "source");
      const source2Id = await createWikiPage("source-2", "Source Two", "entity");

      await createWikiLink(source1Id, targetId, "reference");
      await createWikiLink(source2Id, targetId, "related");

      const response = await fastify.inject({
        method: "GET",
        url: `/api/wiki-links/to/${targetId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body.data.length).toBe(2);
      
      const link1 = body.data.find((l: { fromPageId: string }) => l.fromPageId === source1Id);
      expect(link1.relationType).toBe("reference");
      
      const link2 = body.data.find((l: { fromPageId: string }) => l.fromPageId === source2Id);
      expect(link2.relationType).toBe("related");
    });

    it("should include all link properties for incoming links", async () => {
      const sourceId = await createWikiPage("incoming-source", "Incoming Source", "source");
      const targetId = await createWikiPage("incoming-target", "Incoming Target", "concept");
      await createWikiLink(sourceId, targetId, "references");

      const response = await fastify.inject({
        method: "GET",
        url: `/api/wiki-links/to/${targetId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const link = body.data[0];
      expect(link.id).toBeDefined();
      expect(link.fromPageId).toBe(sourceId);
      expect(link.toPageId).toBe(targetId);
      expect(link.relationType).toBe("references");
      expect(link.createdAt).toBeDefined();
    });
  });

  describe("POST /api/wiki-links", () => {
    it("should create a wiki link", async () => {
      const fromId = await createWikiPage("link-from", "Link From", "concept");
      const toId = await createWikiPage("link-to", "Link To", "entity");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/wiki-links",
        payload: {
          fromPageId: fromId,
          toPageId: toId,
          relationType: "reference",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body.data).toBeDefined();
      expect(body.data.fromPageId).toBe(fromId);
      expect(body.data.toPageId).toBe(toId);
      expect(body.data.relationType).toBe("reference");
      expect(body.data.id).toBeDefined();
      expect(body.data.createdAt).toBeDefined();
    });

    it("should require fromPageId field", async () => {
      const toId = await createWikiPage("required-to", "Required To", "entity");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/wiki-links",
        payload: {
          toPageId: toId,
          relationType: "reference",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it("should require toPageId field", async () => {
      const fromId = await createWikiPage("required-from", "Required From", "concept");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/wiki-links",
        payload: {
          fromPageId: fromId,
          relationType: "reference",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it("should require relationType field", async () => {
      const fromId = await createWikiPage("relation-from", "Relation From", "concept");
      const toId = await createWikiPage("relation-to", "Relation To", "entity");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/wiki-links",
        payload: {
          fromPageId: fromId,
          toPageId: toId,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it("should return error when source page not found", async () => {
      const toId = await createWikiPage("valid-to", "Valid To", "entity");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/wiki-links",
        payload: {
          fromPageId: "non-existent-from",
          toPageId: toId,
          relationType: "reference",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("not found");
    });

    it("should return error when target page not found", async () => {
      const fromId = await createWikiPage("valid-from", "Valid From", "concept");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/wiki-links",
        payload: {
          fromPageId: fromId,
          toPageId: "non-existent-to",
          relationType: "reference",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("not found");
    });

    it("should allow creating links with various relation types", async () => {
      const fromId = await createWikiPage("relation-type-from", "Relation Type From", "concept");
      const toId = await createWikiPage("relation-type-to", "Relation Type To", "entity");

      const relationTypes = ["reference", "related", "cites", "extends", "contradicts", "supports"];
      
      for (const relationType of relationTypes) {
        const response = await fastify.inject({
          method: "POST",
          url: "/api/wiki-links",
          payload: {
            fromPageId: fromId,
            toPageId: toId,
            relationType,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.relationType).toBe(relationType);
      }
    });

    it("should allow self-referential links", async () => {
      const pageId = await createWikiPage("self-ref", "Self Reference", "concept");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/wiki-links",
        payload: {
          fromPageId: pageId,
          toPageId: pageId,
          relationType: "self-reference",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.fromPageId).toBe(pageId);
      expect(body.data.toPageId).toBe(pageId);
    });
  });

  describe("DELETE /api/wiki-links/:id", () => {
    it("should delete a wiki link", async () => {
      const fromId = await createWikiPage("delete-from", "Delete From", "concept");
      const toId = await createWikiPage("delete-to", "Delete To", "entity");
      const linkId = await createWikiLink(fromId, toId, "reference");

      const response = await fastify.inject({
        method: "DELETE",
        url: `/api/wiki-links/${linkId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      const links = await storage.wikiLinks.findByFromPageId(fromId);
      expect(links.length).toBe(0);
    });

    it("should return success even for non-existent link", async () => {
      const response = await fastify.inject({
        method: "DELETE",
        url: "/api/wiki-links/non-existent-link-id",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it("should update graph stats after deletion", async () => {
      const fromId = await createWikiPage("stats-from", "Stats From", "concept");
      const toId = await createWikiPage("stats-to", "Stats To", "entity");
      const linkId = await createWikiLink(fromId, toId, "reference");

      const beforeResponse = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });
      const beforeBody = JSON.parse(beforeResponse.body);
      expect(beforeBody.data.stats.totalLinks).toBe(1);

      await fastify.inject({
        method: "DELETE",
        url: `/api/wiki-links/${linkId}`,
      });

      const afterResponse = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });
      const afterBody = JSON.parse(afterResponse.body);
      expect(afterBody.data.stats.totalLinks).toBe(0);
    });

    it("should update orphan count after deletion", async () => {
      const fromId = await createWikiPage("orphan-from", "Orphan From", "concept");
      const toId = await createWikiPage("orphan-to", "Orphan To", "entity");
      const linkId = await createWikiLink(fromId, toId, "reference");

      const beforeResponse = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });
      const beforeBody = JSON.parse(beforeResponse.body);
      expect(beforeBody.data.stats.orphanCount).toBe(0);

      await fastify.inject({
        method: "DELETE",
        url: `/api/wiki-links/${linkId}`,
      });

      const afterResponse = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });
      const afterBody = JSON.parse(afterResponse.body);
      expect(afterBody.data.stats.orphanCount).toBe(2);
    });
  });

  describe("Graph Edge Cases", () => {
    it("should handle page with mixed incoming and outgoing links", async () => {
      const centerId = await createWikiPage("center", "Center Page", "concept");
      const incoming1Id = await createWikiPage("incoming-1", "Incoming One", "entity");
      const incoming2Id = await createWikiPage("incoming-2", "Incoming Two", "entity");
      const incoming3Id = await createWikiPage("incoming-3", "Incoming Three", "entity");
      const outgoing1Id = await createWikiPage("outgoing-1", "Outgoing One", "source");

      await createWikiLink(incoming1Id, centerId, "reference");
      await createWikiLink(incoming2Id, centerId, "reference");
      await createWikiLink(incoming3Id, centerId, "reference");
      await createWikiLink(centerId, outgoing1Id, "reference");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const centerNode = body.data.nodes.find((n: { slug: string }) => n.slug === "center");
      expect(centerNode.incomingLinks).toBe(3);
      expect(centerNode.outgoingLinks).toBe(1);
      expect(centerNode.isHub).toBe(true);
    });

    it("should correctly count links for pages with both directions", async () => {
      const pageAId = await createWikiPage("page-a", "Page A", "concept");
      const pageBId = await createWikiPage("page-b", "Page B", "concept");

      await createWikiLink(pageAId, pageBId, "forward");
      await createWikiLink(pageBId, pageAId, "backward");
      await createWikiLink(pageAId, pageBId, "duplicate-forward");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const nodeA = body.data.nodes.find((n: { slug: string }) => n.slug === "page-a");
      const nodeB = body.data.nodes.find((n: { slug: string }) => n.slug === "page-b");

      expect(nodeA.outgoingLinks).toBe(2);
      expect(nodeA.incomingLinks).toBe(1);
      expect(nodeB.outgoingLinks).toBe(1);
      expect(nodeB.incomingLinks).toBe(2);
    });

    it("should handle large number of pages", async () => {
      const pageIds: string[] = [];
      
      for (let i = 0; i < 50; i++) {
        const pageId = await createWikiPage(`page-${i}`, `Page ${i}`, "concept");
        pageIds.push(pageId);
      }

      for (let i = 0; i < 20; i++) {
        await createWikiLink(pageIds[i], pageIds[i + 10], "reference");
      }

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-links/graph",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data.nodes.length).toBe(50);
      expect(body.data.edges.length).toBe(20);
      expect(body.data.stats.totalPages).toBe(50);
      expect(body.data.stats.totalLinks).toBe(20);
    });
  });
});