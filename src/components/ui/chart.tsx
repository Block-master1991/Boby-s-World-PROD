"use client"

import { cn } from "@/lib/utils"
import * as React from "react"
import * as RechartsPrimitive from "recharts"

const THEMES = { light: "", dark: ".dark" } as const

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
}

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) throw new Error("useChart must be used within a <ChartContainer />")
  return context
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(([, conf]) => conf.theme || conf.color)
  if (!colorConfig.length) return null
  return (
    <style dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES).map(([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig.map(([key, itemConfig]) => {
    const color = itemConfig.theme?.[theme as keyof typeof itemConfig.theme] || itemConfig.color
    return color ? `  --color-${key}: ${color};` : null
  }).join("\n")}
}`).join("\n"),
      }} />
  )
}

const ChartContainer = React.forwardRef<HTMLDivElement, React.ComponentProps<"div"> & {
    config: ChartConfig
    children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
  }>(({ id, className, children, config, ...props }, ref) => {
  const generatedId = React.useId()
  const chartId = `chart-${id || generatedId.replace(/:/g, "")}`
  return (
    <ChartContext.Provider value={{ config }}>
      <div data-chart={chartId} ref={ref} className={cn("flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none", className)} {...props}>
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = "Chart"

interface ChartTooltipPayload {
  name?: string
  value?: number | string
  payload: Record<string, unknown>
  dataKey?: string | number
  color?: string
  fill?: string
}

type FormatterFn = (v: number | string, n: string, i: ChartTooltipPayload, idx: number) => React.ReactNode

const TooltipIndicator = ({ indicator, color, nestLabel }: {
  indicator: "line" | "dot" | "dashed"
  color?: string | undefined
  nestLabel?: boolean | undefined
}) => (
  <div className={cn("shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]", {
      "h-2.5 w-2.5": indicator === "dot",
      "w-1": indicator === "line",
      "w-0 border-[1.5px] border-dashed bg-transparent": indicator === "dashed",
      "my-0.5": nestLabel && indicator === "dashed",
    })} style={{ "--color-bg": color, "--color-border": color, } as React.CSSProperties} />
)

const TooltipItemContent = ({ item, config, indicator, indicatorColor, nestLabel, hideIndicator, nameKey }: {
  item: ChartTooltipPayload; config: ChartConfig; indicator: "line" | "dot" | "dashed"; indicatorColor?: string | undefined; nestLabel: boolean; hideIndicator?: boolean | undefined; nameKey?: string | undefined
}) => {
  const itemConfig = getPayloadConfigFromPayload(config, item, `${nameKey || item.name || item.dataKey || "value"}`)
  return (
    <>
      {itemConfig?.icon ? <itemConfig.icon /> : (!hideIndicator && <TooltipIndicator indicator={indicator} color={indicatorColor} nestLabel={nestLabel} />)}
      <div className={cn("flex flex-1 justify-between leading-none", nestLabel ? "items-end" : "items-center")}>
        <div className="grid gap-1.5">
          {nestLabel && <div className="font-medium">{itemConfig?.label || item.name}</div>}
          <span className="text-muted-foreground">{itemConfig?.label || item.name}</span>
        </div>
        {item.value && <span className="font-mono font-medium tabular-nums text-foreground">{item.value.toLocaleString()}</span>}
      </div>
    </>
  )
}

const TooltipItem = ({ item, config, indicator, nestLabel, nameKey, formatter, index, color, hideIndicator }: {
  item: ChartTooltipPayload; config: ChartConfig; indicator: "line" | "dot" | "dashed"; nestLabel: boolean
  nameKey?: string | undefined; formatter?: FormatterFn | undefined; index: number
  color?: string | undefined; hideIndicator?: boolean | undefined
}) => {
  const indicatorColor = color || (item.payload['fill'] as string) || item.color
  return (
    <div className={cn("flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground", indicator === "dot" && "items-center")}>
      {formatter && item.value !== undefined && item.name ? formatter(item.value, item.name, item, index) : (
        <TooltipItemContent item={item} config={config} indicator={indicator} indicatorColor={indicatorColor} nestLabel={nestLabel} hideIndicator={hideIndicator} nameKey={nameKey} />
      )}
    </div>
  )
}

interface TooltipLabelProps {
  config: ChartConfig
  payload: ChartTooltipPayload[]
  label?: string | number | undefined
  labelKey?: string | undefined
  labelFormatter?: ((v: string | number | React.ReactNode, p: ChartTooltipPayload[]) => React.ReactNode) | undefined
  labelClassName?: string | undefined
  hideLabel?: boolean | undefined
}

const TooltipLabel = ({ config, payload, label, labelKey, labelFormatter, labelClassName, hideLabel }: TooltipLabelProps) => {
  if (hideLabel || !payload[0]) return null
  const [item] = payload
  const itemConfig = getPayloadConfigFromPayload(config, item, `${labelKey || item.dataKey || item.name || "value"}`)
  const value = !labelKey && typeof label === "string" ? config[label as keyof typeof config]?.label || label : itemConfig?.label
  return (
    <div className={cn("font-medium", labelClassName)}>
      {labelFormatter ? labelFormatter(value as string | number, payload) : value}
    </div>
  )
}

const ChartTooltipContent = React.forwardRef<HTMLDivElement, React.ComponentProps<typeof RechartsPrimitive.Tooltip> & React.ComponentProps<"div"> & {
      hideLabel?: boolean; hideIndicator?: boolean; indicator?: "line" | "dot" | "dashed"
      nameKey?: string; labelKey?: string; payload?: ChartTooltipPayload[]
      label?: string | number; labelFormatter?: (v: string | number | React.ReactNode, p: ChartTooltipPayload[]) => React.ReactNode
      labelClassName?: string; formatter?: FormatterFn; color?: string
    }>(({ active, payload, className, indicator = "dot", hideLabel = false, hideIndicator = false, label, labelFormatter, labelClassName, formatter, color, nameKey, labelKey }, ref) => {
  const { config } = useChart()
  if (!active || !payload?.length) return null
  const nestLabel = payload.length === 1 && indicator !== "dot"
  return (
    <div ref={ref} className={cn("grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl", className)}>
      {!nestLabel && <TooltipLabel config={config} payload={payload} label={label} labelKey={labelKey} labelFormatter={labelFormatter as TooltipLabelProps["labelFormatter"]} labelClassName={labelClassName} hideLabel={hideLabel} />}
      <div className="grid gap-1.5">
        {payload.map((item, index) => (
          <TooltipItem key={item.dataKey || index} item={item} config={config} indicator={indicator} nestLabel={nestLabel} nameKey={nameKey} formatter={formatter} index={index} color={color} hideIndicator={hideIndicator} />
        ))}
      </div>
    </div>
  )
})
ChartTooltipContent.displayName = "ChartTooltip"

const LegendItem = ({ item, config, nameKey, hideIcon }: { item: ChartTooltipPayload; config: ChartConfig; nameKey?: string | undefined; hideIcon?: boolean | undefined }) => {
  const itemConfig = getPayloadConfigFromPayload(config, item, `${nameKey || item.dataKey || "value"}`)
  return (
    <div className="flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground">
      {itemConfig?.icon && !hideIcon ? <itemConfig.icon /> : <div className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />}
      {itemConfig?.label}
    </div>
  )
}

const ChartLegendContent = React.forwardRef<HTMLDivElement, React.ComponentProps<"div"> & Pick<RechartsPrimitive.LegendProps, "verticalAlign"> & {
      hideIcon?: boolean; nameKey?: string; payload?: ChartTooltipPayload[]
    }>(({ className, hideIcon = false, payload, verticalAlign = "bottom", nameKey }, ref) => {
  const { config } = useChart()
  if (!payload?.length) return null
  return (
    <div ref={ref} className={cn("flex items-center justify-center gap-4", verticalAlign === "top" ? "pb-3" : "pt-3", className)}>
      {payload.map((item, index) => <LegendItem key={item.name || index} item={item} config={config} nameKey={nameKey} hideIcon={hideIcon} />)}
    </div>
  )
})
ChartLegendContent.displayName = "ChartLegend"

function getPayloadConfigFromPayload(config: ChartConfig, payload: unknown, key: string) {
  if (typeof payload !== "object" || payload === null) return undefined
  const p = "payload" in payload && typeof payload.payload === "object" && payload.payload !== null ? (payload.payload as Record<string, unknown>) : undefined
  let k : string = key
  if (key in payload && typeof (payload as Record<string, unknown>)[key] === "string") k = (payload as Record<string, unknown>)[key] as string
  else if (p && key in p && typeof p[key] === "string") k = p[key] as string
  return k in config ? config[k] : config[key as keyof typeof config]
}

const ChartTooltip = RechartsPrimitive.Tooltip
const ChartLegend = RechartsPrimitive.Legend
export { ChartContainer, ChartLegend, ChartLegendContent, ChartStyle, ChartTooltip, ChartTooltipContent }
