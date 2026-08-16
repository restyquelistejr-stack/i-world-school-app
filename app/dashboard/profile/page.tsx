'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

interface Country {
  id: string;
  name: string;
}

interface City {
  id: string;
  name: string;
  country_id: string;
}

interface Building {
  id: string;
  name: string;
  city_id: string;
}

interface Floor {
  id: string;
  floor_number: number;
  name: string;
  building_id: string;
}

interface Room {
  id: string;
  room_number: string;
  name: string;
  floor_id: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  // Reference data
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [formData, setFormData] = useState({
    full_name: '',
    phone_number: '',
    bio: '',
    country_id: '',
    city_id: '',
    building_id: '',
    floor_id: '',
    room_id: '',
    timezone: 'Asia/Singapore',
    profile_picture: '',
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      // Get user profile
      const { data: profileData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileData) {
        setFormData({
          full_name: profileData.full_name || '',
          phone_number: profileData.phone_number || '',
          bio: profileData.bio || '',
          country_id: profileData.country_id || '',
          city_id: profileData.city_id || '',
          building_id: profileData.building_id || '',
          floor_id: profileData.floor_id || '',
          room_id: profileData.room_id || '',
          timezone: profileData.timezone || 'Asia/Singapore',
          profile_picture: profileData.profile_picture || '',
        });
      }

      // Load reference data
      const [countriesRes, citiesRes, buildingsRes, floorsRes, roomsRes] = await Promise.all([
        supabase.from('countries').select('*').eq('is_active', true).order('name'),
        supabase.from('cities').select('*').eq('is_active', true).order('name'),
        supabase.from('buildings').select('*').eq('is_active', true).order('name'),
        supabase.from('floors').select('*').eq('is_active', true).order('floor_number'),
        supabase.from('rooms').select('*').eq('is_active', true).order('room_number'),
      ]);

      setCountries(countriesRes.data || []);
      setCities(citiesRes.data || []);
      setBuildings(buildingsRes.data || []);
      setFloors(floorsRes.data || []);
      setRooms(roomsRes.data || []);

    } catch (error) {
      console.error('Error loading profile:', error);
      alert('Failed to load profile');
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: formData.full_name,
          phone_number: formData.phone_number,
          bio: formData.bio,
          country_id: formData.country_id || null,
          city_id: formData.city_id || null,
          building_id: formData.building_id || null,
          floor_id: formData.floor_id || null,
          room_id: formData.room_id || null,
          timezone: formData.timezone,
        })
        .eq('id', user.id);

      if (error) throw error;
      
      // Also update auth user metadata
      await supabase.auth.updateUser({
        data: { full_name: formData.full_name }
      });

      alert('✅ Profile updated successfully!');
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
    setSaving(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `profiles/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update user profile with image URL
      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_picture: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setFormData({ ...formData, profile_picture: publicUrl });
      alert('✅ Profile picture uploaded!');
    } catch (error: any) {
      alert('Error uploading: ' + error.message);
    }
    setUploading(false);
  }

  // Filter cascading
  const filteredCities = cities.filter(c => c.country_id === formData.country_id);
  const filteredBuildings = buildings.filter(b => b.city_id === formData.city_id);
  const filteredFloors = floors.filter(f => f.building_id === formData.building_id);
  const filteredRooms = rooms.filter(r => r.floor_id === formData.floor_id);

  function getLocationSummary() {
    const parts = [
      countries.find(c => c.id === formData.country_id)?.name,
      cities.find(c => c.id === formData.city_id)?.name,
      buildings.find(b => b.id === formData.building_id)?.name,
      floors.find(f => f.id === formData.floor_id)?.name || `Floor ${floors.find(f => f.id === formData.floor_id)?.floor_number}`,
      rooms.find(r => r.id === formData.room_id)?.room_number,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' → ') : 'No location set';
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-600 hover:text-gray-900"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <form onSubmit={handleSubmit}>
            {/* Profile Picture */}
            <div className="flex items-center gap-6 mb-6">
              <div className="relative">
                {formData.profile_picture ? (
                  <img
                    src={formData.profile_picture}
                    alt="Profile"
                    className="w-24 h-24 rounded-full object-cover border-2 border-gray-200"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center text-3xl text-blue-600 border-2 border-gray-200">
                    {formData.full_name?.charAt(0) || 'U'}
                  </div>
                )}
                <label className="absolute bottom-0 right-0 bg-blue-600 text-white p-1 rounded-full cursor-pointer hover:bg-blue-700 text-xs">
                  📷
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>
              <div>
                <p className="text-sm text-gray-500">Upload a profile picture</p>
                {uploading && <p className="text-sm text-blue-600">Uploading...</p>}
              </div>
            </div>

            {/* Personal Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone Number</label>
                <input
                  type="text"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+1234567890"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Bio</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Tell us a bit about yourself..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Timezone</label>
                <select
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Asia/Singapore">Asia/Singapore (UTC+8)</option>
                  <option value="Asia/Kuala_Lumpur">Asia/Kuala Lumpur (UTC+8)</option>
                  <option value="Asia/Manila">Asia/Manila (UTC+8)</option>
                  <option value="Asia/Jakarta">Asia/Jakarta (UTC+7)</option>
                  <option value="America/New_York">America/New York (UTC-5)</option>
                  <option value="America/Los_Angeles">America/Los Angeles (UTC-8)</option>
                  <option value="Europe/London">Europe/London (UTC+0)</option>
                  <option value="Europe/Paris">Europe/Paris (UTC+1)</option>
                  <option value="Australia/Sydney">Australia/Sydney (UTC+10)</option>
                  <option value="Pacific/Auckland">Pacific/Auckland (UTC+12)</option>
                </select>
              </div>
            </div>

            {/* Location Information */}
            <div className="border-t pt-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">📍 Default Location</h3>
              <p className="text-sm text-gray-500 mb-4">
                This location will be pre-selected when creating classes.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Country</label>
                  <select
                    value={formData.country_id}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      country_id: e.target.value, 
                      city_id: '', 
                      building_id: '', 
                      floor_id: '', 
                      room_id: '' 
                    })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Country</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">City</label>
                  <select
                    value={formData.city_id}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      city_id: e.target.value, 
                      building_id: '', 
                      floor_id: '', 
                      room_id: '' 
                    })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!formData.country_id}
                  >
                    <option value="">Select City</option>
                    {filteredCities.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Building</label>
                  <select
                    value={formData.building_id}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      building_id: e.target.value, 
                      floor_id: '', 
                      room_id: '' 
                    })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!formData.city_id}
                  >
                    <option value="">Select Building</option>
                    {filteredBuildings.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Floor</label>
                  <select
                    value={formData.floor_id}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      floor_id: e.target.value, 
                      room_id: '' 
                    })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!formData.building_id}
                  >
                    <option value="">Select Floor</option>
                    {filteredFloors.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name || `Floor ${f.floor_number}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Room</label>
                  <select
                    value={formData.room_id}
                    onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!formData.floor_id}
                  >
                    <option value="">Select Room</option>
                    {filteredRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.room_number} {r.name ? `- ${r.name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {formData.country_id && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    📍 <strong>Current Location:</strong> {getLocationSummary()}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}