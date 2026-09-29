'use client';

interface FormatSelectorProps {
  onSelect: (format: 'private' | 'group') => void;
  onBack: () => void;
}

export default function FormatSelector({ onSelect, onBack }: FormatSelectorProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <p className="text-sm text-gray-500">Choose how you'd like to learn</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Private */}
        <button
          onClick={() => onSelect('private')}
          className="group p-6 bg-white rounded-xl border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left"
        >
          <div className="text-3xl mb-3">👤</div>
          <h3 className="text-lg font-bold text-gray-900">Private Lesson</h3>
          <p className="text-sm text-gray-500 mt-2">
            1-on-1 attention with a dedicated teacher
          </p>
          <ul className="mt-3 text-sm text-gray-600 space-y-1">
            <li>• Personalized pace</li>
            <li>• Flexible schedule</li>
            <li>• Focused attention</li>
          </ul>
          <div className="mt-4 text-blue-600 font-medium group-hover:underline">
            Select →
          </div>
        </button>

        {/* Group */}
        <button
          onClick={() => onSelect('group')}
          className="group p-6 bg-white rounded-xl border-2 border-green-200 hover:border-green-400 hover:bg-green-50 transition-all text-left"
        >
          <div className="text-3xl mb-3">👥</div>
          <h3 className="text-lg font-bold text-gray-900">Group Session</h3>
          <p className="text-sm text-gray-500 mt-2">
            Learn with other students at the same level
          </p>
          <ul className="mt-3 text-sm text-gray-600 space-y-1">
            <li>• Social learning</li>
            <li>• Pre-scheduled times</li>
            <li>• Lower cost</li>
          </ul>
          <div className="mt-4 text-green-600 font-medium group-hover:underline">
            Select →
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