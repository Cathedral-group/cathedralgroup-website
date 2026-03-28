'use client'

interface Tab {
  key: string
  label: string
}

interface TabPanelProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (key: string) => void
  children: React.ReactNode
}

export default function TabPanel({ tabs, activeTab, onTabChange, children }: TabPanelProps) {
  return (
    <div>
      <div className="flex gap-6 border-b border-neutral-100 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`pb-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${
              activeTab === tab.key
                ? 'text-primary border-b-2 border-primary'
                : 'text-neutral-400 hover:text-neutral-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{children}</div>
    </div>
  )
}
