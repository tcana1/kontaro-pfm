
import { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
  DoughnutController,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
  DoughnutController
);

export const chartColors = [
  '#4ade80', // green
  '#f87171', // red
  '#60a5fa', // blue
  '#fbbf24', // yellow
  '#a78bfa', // purple
  '#f472b6', // pink
];

export { Chart };
