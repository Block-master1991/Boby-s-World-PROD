"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ChartDataItem {
  name: string;
  value: number;
  color?: string;
  [key: string]: string | number | boolean | undefined;
}

interface ChartUIWrapperProps {
  type: "bar" | "line" | "pie";
  data: ChartDataItem[];
}

const BarChartUI = ({ data }: { data: ChartDataItem[] }) => (
  <ResponsiveContainer width="100%" height={300}>
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="name" axisLine={false} tickLine={false} />
      <YAxis axisLine={false} tickLine={false} />
      <Tooltip />
      <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
);

const LineChartUI = ({ data }: { data: ChartDataItem[] }) => (
  <ResponsiveContainer width="100%" height={300}>
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="name" axisLine={false} tickLine={false} />
      <YAxis axisLine={false} tickLine={false} />
      <Tooltip />
      <Line
        type="monotone"
        dataKey="value"
        stroke="hsl(var(--primary))"
        strokeWidth={2}
        dot={false}
      />
    </LineChart>
  </ResponsiveContainer>
);

const PieChartUI = ({ data }: { data: ChartDataItem[] }) => (
  <ResponsiveContainer width="100%" height={240}>
    <PieChart>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        innerRadius={40}
        outerRadius={80}
        paddingAngle={5}
        dataKey="value"
      >
        {data.map((entry, index) => (
          <Cell
            key={`cell-${index}`}
            fill={entry.color || `hsl(var(--chart-${(index % 5) + 1}))`}
          />
        ))}
      </Pie>
      <Tooltip />
      <Legend />
    </PieChart>
  </ResponsiveContainer>
);

export default function ChartUIWrapper({ type, data }: ChartUIWrapperProps) {
  switch (type) {
    case "bar":
      return <BarChartUI data={data} />;
    case "line":
      return <LineChartUI data={data} />;
    case "pie":
      return <PieChartUI data={data} />;
    default:
      return null;
  }
}
