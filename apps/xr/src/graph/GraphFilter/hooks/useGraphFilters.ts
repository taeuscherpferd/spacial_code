import type { ProgramGraph } from '@/connection/protocol'
import type { GroupMode } from '@/graph/GraphCluster/GraphCluster.logic'
import {
  type ExtensionCount,
  type ExternalModulesMode,
  GraphFilterLogic,
  type GraphFilters,
  defaultGraphFilters,
} from '@/graph/GraphFilter/GraphFilter.logic'
import {
  GraphSearchLogic,
  type SearchResult,
} from '@/graph/GraphFilter/GraphSearch.logic'
import { useDeferredValue, useMemo, useState } from 'react'

const maxResults = 30

export interface GraphFilterControls {
  filters: GraphFilters
  deferredFilters: GraphFilters
  extensions: ExtensionCount[]
  results: SearchResult[]
  activeCount: number
  setQuery: (query: string) => void
  toggleTests: () => void
  toggleExtension: (extension: string) => void
  setExternalModules: (mode: ExternalModulesMode) => void
  setGroupBy: (mode: GroupMode) => void
  toggleShowGroups: () => void
  reset: () => void
}

export const useGraphFilters = (graph: ProgramGraph): GraphFilterControls => {
  const [filters, setFilters] = useState<GraphFilters>(defaultGraphFilters)
  const deferredFilters = useDeferredValue(filters)
  const extensions = useMemo(() => GraphFilterLogic.extensions(graph), [graph])
  const { hideTests, hiddenExtensions, externalModules } = filters

  const searchable = useMemo(
    () =>
      GraphFilterLogic.apply(graph, {
        ...defaultGraphFilters,
        hideTests,
        hiddenExtensions,
        externalModules,
      }).nodes,
    [graph, hideTests, hiddenExtensions, externalModules],
  )

  const deferredQuery = useDeferredValue(filters.query)

  const results = useMemo(
    () => GraphSearchLogic.search(searchable, deferredQuery, maxResults),
    [searchable, deferredQuery],
  )

  const update = (patch: Partial<GraphFilters>): void =>
    setFilters((current) => ({ ...current, ...patch }))

  return {
    filters,
    deferredFilters,
    extensions,
    results,
    activeCount: GraphFilterLogic.activeCount(filters),
    setQuery: (query) => update({ query }),
    toggleTests: () =>
      setFilters((current) => ({ ...current, hideTests: !current.hideTests })),
    toggleExtension: (extension) =>
      setFilters((current) => ({
        ...current,
        hiddenExtensions: current.hiddenExtensions.includes(extension)
          ? current.hiddenExtensions.filter((entry) => entry !== extension)
          : [...current.hiddenExtensions, extension],
      })),
    setExternalModules: (externalModules) => update({ externalModules }),
    setGroupBy: (groupBy) => update({ groupBy }),
    toggleShowGroups: () =>
      setFilters((current) => ({
        ...current,
        showGroups: !current.showGroups,
      })),
    reset: () =>
      setFilters((current) => ({
        ...defaultGraphFilters,
        groupBy: current.groupBy,
        showGroups: current.showGroups,
      })),
  }
}
