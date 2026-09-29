'use client';

interface ActionSelectorProps {
  onSelect: (action: 'trial' | 'register') => void;
  onBack: () => void;
}

export default function ActionSelector({ onSelect, onBack }: ActionSelectorProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <p className="text-sm text-gray-500">Choose how you'd like to proceed</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Trial Class */}
        <button
          onClick={() => onSelect('trial')}
          className="group p-6 bg-white rounded-xl border-2 border-purple-200 hover:border-purple-400 hover:bg-purple-50 transition-all text-left"
        >
          <div className="text-3xl mb-3">🎯</div>
          <h3 className="text-lg font-bold text-gray-900">Try a Trial Class</h3>
          <p className="text-sm text-gray-500 mt-2">
            Get a feel for the class before committing
          </p>
          <ul className="mt-3 text-sm text-gray-600 space-y-1">
            <li>• Free trial session</li>
            <li>• Meet the teacher</li>
            <li>• Experience the class style</li>
          </ul>
          <div className="mt-4 text-purple-600 font-medium group-hover:underline">
            Start Trial →
          </div>
        </button>

        {/* Register Directly */}
        <button
          onClick={() => onSelect('register')}
          className="group p-6 bg-white rounded-xl border-2 border-green-200 hover:border-green-400 hover:bg-green-50 transition-all text-left"
        >
          <div className="text-3xl mb-3">📝</div>
          <h3 className="text-lg font-bold text-gray-900">Register Directly</h3>
          <p className="text-sm text-gray-500 mt-2">
            Skip the trial and enroll in the full course
          </p>
          <ul className="mt-3 text-sm text-gray-600 space-y-1">
            <li>• Full course enrollment</li>
            <li>• Secure your spot</li>
            <li>• Start learning immediately</li>
          </ul>
          <div className="mt-4 text-green-600 font-medium group-hover:underline">
            Start Registration →
          </div>
        </button>
      </div>

      <div className="flex justify-start pt-4 border-t">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-600 hover:text-gray-800"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}