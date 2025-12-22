export default function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 dark:border-primary-400" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  );
}
