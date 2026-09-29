'use client';

interface BookingEntryProps {
  onSelect: (type: 'class' | 'room') => void;
}

export default function BookingEntry({ onSelect }: BookingEntryProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-gray-800">What would you like to do?</h2>
        <p className="text-sm text-gray-500 mt-1">Choose an option to get started</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Book a Class */}
        <button
          onClick={() => onSelect('class')}
          className="group p-8 bg-white rounded-xl border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left"
        >
          <div className="text-4xl mb-3">📚</div>
          <h3 className="text-xl font-bold text-gray-900">Book a Class</h3>
          <p className="text-sm text-gray-500 mt-2">
            Enroll in a course or try a trial class
          </p>
          <ul className="mt-3 text-sm text-gray-600 space-y-1">
            <li>• Private or Group sessions</li>
            <li>• Trial class available</li>
            <li>• Direct registration</li>
          </ul>
          <div className="mt-4 text-blue-600 font-medium group-hover:underline">
            Get Started →
          </div>
        </button>

        {/* Book a Room */}
        <button
          onClick={() => onSelect('room')}
          className="group p-8 bg-white rounded-xl border-2 border-green-200 hover:border-green-400 hover:bg-green-50 transition-all text-left"
        >
          <div className="text-4xl mb-3">🏠</div>
          <h3 className="text-xl font-bold text-gray-900">Book a Room</h3>
          <p className="text-sm text-gray-500 mt-2">
            Reserve a room for classes, meetings, or events
          </p>
          <ul className="mt-3 text-sm text-gray-600 space-y-1">
            <li>• Check room availability</li>
            <li>• Quick booking process</li>
            <li>• Flexible time slots</li>
          </ul>
          <div className="mt-4 text-green-600 font-medium group-hover:underline">
            Get Started →
          </div>
        </button>
      </div>
    </div>
  );
}