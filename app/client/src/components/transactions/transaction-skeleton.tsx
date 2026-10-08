import React from 'react';
import { cn } from '@/lib/utils';

interface TransactionSkeletonProps {
  rows?: number;
}

const TransactionSkeleton: React.FC<TransactionSkeletonProps> = ({ rows = 4 }) => {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <tr key={index} className="border-b border-gray-200 dark:border-gray-700">
          {/* Checkbox column */}
          <td className="px-5 py-3 w-[30px]">
            <div className="flex items-center justify-center">
              <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          </td>
          
          {/* Date column */}
          <td className="px-4 py-3 w-[90px]">
            <div className="w-16 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </td>
          
          {/* Payee column */}
          <td className="px-4 py-3 w-[200px]">
            <div className="w-32 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </td>
          
          {/* Category column */}
          <td className="px-4 py-3 w-[220px]">
            <div className="w-40 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </td>
          
          {/* Notes column */}
          <td className="hidden md:table-cell px-4 py-3 w-[150px]">
            <div className="w-24 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </td>
          
          {/* Account column */}
          <td className="hidden md:table-cell px-4 py-3 w-[120px]">
            <div className="w-20 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </td>
          
          {/* Amount column */}
          <td className="px-4 py-3 w-[100px] text-right">
            <div className="w-16 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse ml-auto" />
          </td>
          
          {/* Installment column */}
          <td className="hidden md:table-cell px-4 py-3 w-[60px] text-center">
            <div className="w-8 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mx-auto" />
          </td>
          
          {/* Status column */}
          <td className="px-4 py-3 w-[50px] text-center">
            <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse mx-auto" />
          </td>
          
          {/* Ignore column */}
          <td className="hidden md:table-cell px-2 py-3 w-[35px] text-center">
            <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mx-auto" />
          </td>
          
          {/* Buffer column for scrollbar clearance */}
          <td className="w-[20px]"></td>
        </tr>
      ))}
    </>
  );
};

export default TransactionSkeleton;