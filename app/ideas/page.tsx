import { redirect } from "next/navigation";

// /ideas was the standalone AI Resources page. The Ideas surface is
// now the leftmost column of the Content Pipeline at /board. This
// route stays as a permanent redirect so Slack digest links, old
// bookmarks, and the OG image stay functional.
export default function IdeasRedirect(): never {
  redirect("/board");
}
