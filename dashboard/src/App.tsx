import { ClaimPage } from "./ClaimPage";
import { InstructionsPage } from "./InstructionsPage";
import { QueuePage } from "./QueuePage";
import { useRoute, type Route } from "./route";

function Page({ route }: Readonly<{ route: Route }>) {
  switch (route.page) {
    case "claim":
      return <ClaimPage key={route.claimId} claimId={route.claimId} />;
    case "instructions":
      return <InstructionsPage />;
    case "queue":
      return <QueuePage />;
  }
}

export function App() {
  const route = useRoute();
  const current = (page: Route["page"]) =>
    route.page === page ? "page" : undefined;
  return (
    <>
      <header className="site-header">
        <a className="brand" href="#/">
          UnderCover <span className="tagline">Claims desk</span>
        </a>
        <nav aria-label="Main">
          <a href="#/" aria-current={current("queue")}>
            Queue
          </a>
          <a href="#/instructions" aria-current={current("instructions")}>
            Instructions
          </a>
        </nav>
      </header>
      <main>
        <Page route={route} />
      </main>
    </>
  );
}
