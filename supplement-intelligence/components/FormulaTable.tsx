import type { FormulaIngredient } from '@/types/memo'

export default function FormulaTable({
  formula,
}: {
  formula: FormulaIngredient[]
}) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider w-[30%]">
              Ingredient
            </th>
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider w-[12%]">
              Dose
            </th>
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Role
            </th>
            <th className="text-center py-2.5 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider w-[14%]">
              Evidence
            </th>
          </tr>
        </thead>
        <tbody>
          {formula.map((row, i) => (
            <tr
              key={i}
              className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
            >
              <td className="py-3 px-3 font-medium text-white">
                {row.ingredient}
              </td>
              <td className="py-3 px-3 font-mono text-emerald-400 text-xs">
                {row.dose}
              </td>
              <td className="py-3 px-3 text-zinc-400 leading-relaxed">
                {row.role}
              </td>
              <td className="py-3 px-3 text-center">
                <span
                  className="text-sm"
                  title={evidenceLabel(row.evidence)}
                >
                  {row.evidence}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function evidenceLabel(e: string) {
  const stars = (e.match(/★/g) || []).length
  if (stars >= 5) return 'Multiple large RCTs'
  if (stars === 4) return 'At least one solid RCT'
  if (stars === 3) return 'Preliminary clinical data + strong mechanism'
  if (stars === 2) return 'Traditional use + mechanistic evidence'
  return 'Theoretical / early stage'
}
