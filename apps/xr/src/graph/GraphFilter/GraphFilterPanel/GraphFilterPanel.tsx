import { useEffect, useRef, useState } from 'react'
import type { GraphNode } from '@/connection/protocol'
import {
  type ExternalModulesMode,
  GraphFilterLogic,
  externalModulesLabels,
} from '@/graph/GraphFilter/GraphFilter.logic'
import type { GraphFilterControls } from '@/graph/GraphFilter/hooks/useGraphFilters'
import styles from './GraphFilterPanel.module.scss'

interface GraphFilterPanelProps {
  controls: GraphFilterControls
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectNode: (node: GraphNode) => void
}

const modes: ExternalModulesMode[] = ['hide', 'related', 'all']

/** The desktop filters menu. Ctrl+P opens it with the search focused, like VS Code. */
export const GraphFilterPanel = ({
  controls,
  open,
  onOpenChange,
  onSelectNode,
}: GraphFilterPanelProps) => {
  const search = useRef<HTMLInputElement>(null)
  const [highlighted, setHighlighted] = useState(0)
  const { filters, results } = controls

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        // Otherwise the browser opens its print dialog.
        event.preventDefault()
        onOpenChange(true)
        requestAnimationFrame(() => search.current?.select())
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpenChange])

  if (!open) {
    return null
  }
  const choose = (node: GraphNode | undefined): void => {
    if (node) onSelectNode(node)
  }

  return (
    <section
      className={styles.panel}
      aria-label="Graph filters"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onOpenChange(false)
      }}
    >
      <div className={styles.search}>
        <input
          ref={search}
          autoFocus
          value={filters.query}
          placeholder="Search files and symbols"
          aria-label="Search files and symbols"
          onChange={(event) => {
            controls.setQuery(event.target.value)
            setHighlighted(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const step = event.key === 'ArrowDown' ? 1 : -1
              setHighlighted((current) =>
                Math.min(Math.max(current + step, 0), results.length - 1),
              )
            } else if (event.key === 'Enter') {
              choose(results[highlighted]?.node)
            }
          }}
        />
        {filters.query && (
          <button
            type="button"
            className={styles.clear}
            aria-label="Clear search"
            onClick={() => controls.setQuery('')}
          >
            ✕
          </button>
        )}
      </div>
      {filters.query && (
        <ul className={styles.results}>
          {results.map((result, index) => (
            <li key={result.node.id}>
              <button
                type="button"
                className={index === highlighted ? styles.highlighted : ''}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => choose(result.node)}
              >
                <span className={styles.label}>{result.label}</span>
                <span className={styles.context}>{result.context}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className={styles.muted}>No matches</li>}
        </ul>
      )}

      <div className={styles.section}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={filters.hideTests}
            onChange={controls.toggleTests}
          />
          Hide tests
        </label>
      </div>

      <div className={styles.section}>
        <h3>Packages</h3>
        <div className={styles.segmented} role="radiogroup">
          {modes.map((mode) => (
            <button
              type="button"
              role="radio"
              key={mode}
              aria-checked={filters.externalModules === mode}
              onClick={() => controls.setExternalModules(mode)}
            >
              {externalModulesLabels[mode]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h3>File types</h3>
        <div className={styles.types}>
          {controls.extensions.map(({ extension, count }) => (
            <label className={styles.check} key={extension}>
              <input
                type="checkbox"
                checked={!filters.hiddenExtensions.includes(extension)}
                onChange={() => controls.toggleExtension(extension)}
              />
              {GraphFilterLogic.extensionLabel(extension)}
              <span className={styles.count}>{count}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          disabled={controls.activeCount === 0}
          onClick={controls.reset}
        >
          Reset filters
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Close
        </button>
      </div>
    </section>
  )
}
