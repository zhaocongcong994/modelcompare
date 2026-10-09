import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { asset } = await params;
  redirect(`/modelcompare/${asset.join('/')}`);
}
