export default function GovFooter() {
  return (
    <footer className="bg-gov-navy text-white/80 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
          {/* Column 1 */}
          <div>
            <h4 className="font-semibold text-white text-sm mb-2">
              RailOpt — Maintenance Scheduler
            </h4>
            <p className="leading-relaxed text-white/60">
              AI-powered railway maintenance scheduling system integrating TDMS,
              SMMS, and TDS subsystems for optimal track maintenance planning
              and conflict-free train rerouting.
            </p>
          </div>

          {/* Column 2 */}
          <div>
            <h4 className="font-semibold text-white text-sm mb-2">
              Quick Links
            </h4>
            <ul className="space-y-1 text-white/60">
              <li>
                <span className="hover:text-white cursor-pointer">
                  Dashboard
                </span>
              </li>
              <li>
                <span className="hover:text-white cursor-pointer">
                  Alternate Schedule
                </span>
              </li>
              <li>
                <span className="hover:text-white cursor-pointer">
                  Solver Documentation
                </span>
              </li>
            </ul>
          </div>

          {/* Column 3 */}
          <div>
            <h4 className="font-semibold text-white text-sm mb-2">
              Technical Details
            </h4>
            <ul className="space-y-1 text-white/60">
              <li>Solver: Mixed-Integer Programming (CBC/CPLEX)</li>
              <li>Simulation: SUMO Microscopic Engine</li>
              <li>AI Agent: Google Gemini</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-6 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-white/40">
          <span>
            © {new Date().getFullYear()} RailOpt · Ministry of Railways ·
            Government of India
          </span>
          <span>
            Designed & Developed under Digital India Initiative
          </span>
        </div>
      </div>

      {/* Bottom tricolor */}
      <div className="tricolor-stripe" />
    </footer>
  );
}
