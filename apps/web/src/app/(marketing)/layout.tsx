// The public marketing surface: cream editorial world with its own nav,
// no product chrome. Signed-in pages live in the sibling (app) group.
export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <main className="flex flex-1 flex-col">{children}</main>;
}
