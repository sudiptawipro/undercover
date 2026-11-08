import type { Claim } from "./api";
import { money, sentenceCase } from "./format";

export function ClaimDetails({ claim }: Readonly<{ claim: Claim }>) {
  return (
    <>
      <section className="panel">
        <h2>Story</h2>
        <p>{claim.story}</p>
      </section>
      <section className="panel">
        <h2>Items claimed</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Category</th>
                <th scope="col" className="number">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {claim.items.map((item) => (
                <tr key={item.description}>
                  <td>{item.description}</td>
                  <td>{sentenceCase(item.category)}</td>
                  <td className="number mono">{money(item.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={2}>
                  Total claimed
                </th>
                <td className="number mono">{money(claim.amount_claimed)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Documents</h2>
        <ul className="documents">
          {claim.documents.map((document) => (
            <li key={document.name}>
              <h3>
                {document.name}{" "}
                <span className="muted">{sentenceCase(document.type)}</span>
              </h3>
              <p>{document.content}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
