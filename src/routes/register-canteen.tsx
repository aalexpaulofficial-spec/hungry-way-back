import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/foodexa/Navbar";
import { Footer } from "@/components/foodexa/Footer";
import { CanteenSection } from "@/components/foodexa/CanteenSection";

const title = "Register Your Canteen — HUNGRY";
const description =
  "Apply to bring your campus canteen onto HUNGRY, or log in to your approved canteen dashboard with your 7-character code.";

export const Route = createFileRoute("/register-canteen")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RegisterCanteenPage,
});

function RegisterCanteenPage() {
  return (
    <>
      <Navbar />
      <main>
        <CanteenSection />
      </main>
      <Footer />
    </>
  );
}
