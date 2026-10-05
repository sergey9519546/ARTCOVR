import assert from "node:assert/strict";
import { test } from "node:test";
import { displayArtworks, featuredArtworks, getArtworkGenres, displayGenreLabel } from "./artworks";
import { ANSWER_GUIDE_BY_PATH } from "./answer-guides";
import { getPrerenderedRoutePaths, getRouteMetadata } from "./route-metadata";
import { buildRouteStructuredData } from "./route-structured-data";
import { renderStaticRoute } from "./static-render";

const getGenres = (artwork: (typeof displayArtworks)[number]) =>
  getArtworkGenres(artwork).map(displayGenreLabel);
const siteUrl = "https://example.com";

function context(path: string, origin = siteUrl) {
  return {
    artworks: displayArtworks,
    homepageArtworks: featuredArtworks.slice(0, 12),
    siteUrl: origin,
    metadata: getRouteMetadata(path, displayArtworks, getGenres),
    getGenres,
  };
}

test("every prerendered route uses the same graph as the client head", () => {
  for (const path of getPrerenderedRoutePaths(displayArtworks, getGenres)) {
    const input = context(path);
    const html = renderStaticRoute(input).structuredDataHtml;
    const json = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1];
    assert.deepEqual(JSON.parse(json), buildRouteStructuredData(input), path);
  }
});

test("collections keep licensing images and genre breadcrumbs without inventory claims", () => {
  const genre = getArtworkGenres(displayArtworks[0])[0];
  for (const path of ["/", "/cover-art", `/cover-art/${genre}`, "/archive"]) {
    const graph = buildRouteStructuredData(context(path))["@graph"];
    const collection = graph.find((node) => Array.isArray(node["@type"]) && node["@type"].includes("CollectionPage"));
    assert.ok(collection, path);
    assert.equal(collection.url, `${siteUrl}${path}`);
    const images = graph.filter((node) => node["@type"] === "ImageObject");
    assert.ok(images.length > 0, path);
    for (const image of images) {
      assert.equal(image.license, `${siteUrl}/license`);
      assert.match(image.acquireLicensePage, /^https:\/\/example.com\/product\//);
    }
    assert.ok(!graph.some((node) => ["Product", "Offer"].includes(node["@type"])));
    if (path.startsWith("/cover-art/")) {
      const breadcrumb = graph.find((node) => node["@type"] === "BreadcrumbList");
      assert.ok(breadcrumb);
      assert.equal(breadcrumb.itemListElement.at(-1).item, `${siteUrl}${path}`);
    }
  }
  const homepage = buildRouteStructuredData(context("/"))["@graph"];
  assert.deepEqual(
    homepage.filter((node) => node["@type"] === "ImageObject").map((node) => node["@id"]),
    featuredArtworks.slice(0, 12).map((artwork) => `${siteUrl}/product/${artwork.slug}#artwork`),
  );
});

test("guides retain dates, authorship, publisher, citations and FAQ answers", () => {
  for (const [path, guide] of ANSWER_GUIDE_BY_PATH) {
    for (const origin of [siteUrl, ""]) {
      const graph = buildRouteStructuredData(context(path, origin))["@graph"];
      const article = graph.find((node) => node["@type"] === "Article");
      assert.equal(article.datePublished, guide.datePublished);
      assert.equal(article.dateModified, guide.lastReviewed);
      assert.deepEqual(article.author, { "@id": `${origin}#organization` });
      assert.deepEqual(article.publisher, article.author);
      assert.deepEqual(
        article.citation.map((source: { url: string }) => source.url),
        guide.sources.map((source) => origin ? new URL(source.href, origin).toString() : source.href),
      );
      const faq = graph.find((node) => node["@type"] === "FAQPage");
      assert.deepEqual(
        faq.mainEntity.map((question: { acceptedAnswer: { text: string } }) => question.acceptedAnswer.text),
        guide.sections.map((section) => section.answer),
      );
    }
  }
});

test("product and fallback routes never reuse collection or guide context", () => {
  for (const path of [`/product/${displayArtworks[0].slug}`, "/product/%ZZ", "/not-found", "/my-images"]) {
    const graph = buildRouteStructuredData(context(path))["@graph"];
    assert.ok(!graph.some((node) => ["CollectionPage", "Article", "FAQPage", "Product", "Offer"].includes(node["@type"])));
    const webpage = graph.find((node) => node["@type"] === "WebPage");
    assert.equal(webpage.url, `${siteUrl}${path}`);
  }
});
