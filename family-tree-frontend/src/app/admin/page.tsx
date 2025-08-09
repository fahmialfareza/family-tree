export default function AdminDashboard() {
  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>
        <button className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          Log Out
        </button>
      </header>
      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-2 text-lg font-semibold text-gray-700">Users</h2>
          <p className="text-2xl font-bold text-blue-600">123</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-2 text-lg font-semibold text-gray-700">Families</h2>
          <p className="text-2xl font-bold text-green-600">45</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-2 text-lg font-semibold text-gray-700">
            Pending Requests
          </h2>
          <p className="text-2xl font-bold text-red-600">7</p>
        </div>
      </section>
      <section className="mt-10 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold text-gray-700">
          Recent Activity
        </h2>
        <ul className="divide-y divide-gray-200">
          <li className="py-2">
            User <span className="font-semibold">John Doe</span> added a new
            family.
          </li>
          <li className="py-2">
            Family <span className="font-semibold">Smith</span> updated details.
          </li>
          <li className="py-2">
            User <span className="font-semibold">Jane Roe</span> requested
            access.
          </li>
        </ul>
      </section>
    </main>
  );
}
