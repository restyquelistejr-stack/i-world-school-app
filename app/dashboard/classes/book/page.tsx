// app/dashboard/classes/book/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BookingEntry from './components/BookingEntry';
import StudentSelection from './components/StudentSelection';
import StudentContext from './components/StudentContext';
import ActionSelector from './components/ActionSelector';
import FormatSelector from './components/FormatSelector';
import PrivateForm from './components/PrivateForm';
import GroupForm from './components/GroupForm';
import Confirmation from './components/Confirmation';
import Success from './components/Success';
import { useBookingFlow } from './hooks/useBookingFlow';
// ✅ Import from shared types
import type { Inquiry, BookingData } from './types';

type Step = 'entry' | 'student' | 'context' | 'action' | 'format' | 'private_form' | 'group_form' | 'confirm' | 'success';

export default function BookingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>('entry');
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const { formData, updateField, submitBooking, resetForm } = useBookingFlow();

  const handleEntrySelect = (type: 'class' | 'room') => {
    if (type === 'room') {
      router.push('/dashboard/room-booking');
    } else {
      setCurrentStep('student');
    }
  };

  const handleStudentSelect = (inquiry: Inquiry): void => {
    setSelectedInquiry(inquiry);
    updateField('student_id', inquiry.student_id);
    updateField('course_id', inquiry.course_id);
    updateField('module_id', inquiry.module_id);
    updateField('inquiry_id', inquiry.id);
    setCurrentStep('context');
  };

  const handleSkipInquiry = (): void => {
    setCurrentStep('action');
  };

  const handleCourseUpdate = (courseId: string, moduleId: string): void => {
    updateField('course_id', courseId);
    updateField('module_id', moduleId);
    
    if (selectedInquiry) {
      setSelectedInquiry({
        ...selectedInquiry,
        course_id: courseId,
        module_id: moduleId,
      });
    }
  };

  const handleActionSelect = (action: 'trial' | 'register'): void => {
    updateField('action', action);
    setCurrentStep('format');
  };

  const handleFormatSelect = (format: 'private' | 'group'): void => {
    updateField('format', format);
    // ⭐ CRITICAL: Set session_type for trials
    updateField('session_type', format);
    
    // Reset group-specific fields when switching formats
    if (format === 'private') {
      updateField('selected_group_class_id', undefined);
      updateField('isGroupClassBooking', false);
      updateField('group_class_data', undefined);
    } else {
      updateField('isGroupClassBooking', true);
    }
    setCurrentStep(format === 'private' ? 'private_form' : 'group_form');
  };

  const handleBack = (): void => {
    const stepMap: Record<Step, Step> = {
      entry: 'entry',
      student: 'entry',
      context: 'student',
      action: 'context',
      format: 'action',
      private_form: 'format',
      group_form: 'format',
      confirm: 'format',
      success: 'success',
    };
    // If going back from confirm and it's a group class, go to group_form
    if (currentStep === 'confirm' && formData.format === 'group') {
      setCurrentStep('group_form');
      return;
    }
    if (currentStep === 'confirm' && formData.format === 'private') {
      setCurrentStep('private_form');
      return;
    }
    setCurrentStep(stepMap[currentStep] || 'entry');
  };

  const handleSubmit = async (data: BookingData): Promise<void> => {
    const result = await submitBooking(data);
    if (result.success) {
      setCurrentStep('success');
    } else {
      alert(result.message || 'Something went wrong');
    }
  };

  const handleReset = (): void => {
    resetForm();
    setSelectedInquiry(null);
    setCurrentStep('entry');
  };

  // Determine if we should show the progress bar
  const showProgress = currentStep !== 'entry' && currentStep !== 'success';

  // Get step title
  const getStepTitle = () => {
    const titles: Record<Step, string> = {
      entry: '📋 New Booking',
      student: '👤 Select Student',
      context: '📚 Class Details',
      action: '🎯 What would you like to do?',
      format: '📖 Choose Class Format',
      private_form: '👤 Private Lesson Details',
      group_form: '👥 Group Session Details',
      confirm: '✅ Review & Confirm',
      success: '🎉 Booking Complete!',
    };
    return titles[currentStep];
  };

  // Get the list of steps for the progress bar
  const getProgressSteps = () => {
    const baseSteps = ['student', 'context', 'action', 'format'];
    const detailsStep = formData.format === 'group' ? 'group_form' : 'private_form';
    return [...baseSteps, detailsStep, 'confirm'];
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/dashboard/classes/management" className="text-gray-600 hover:text-gray-900 text-sm">
              ← Back to Management
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">
              {getStepTitle()}
            </h1>
          </div>
          {currentStep !== 'entry' && currentStep !== 'success' && (
            <button
              onClick={handleReset}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Start Over
            </button>
          )}
        </div>

        {/* Progress Bar */}
        {showProgress && (
          <div className="mb-6">
            <div className="flex items-center gap-2">
              {getProgressSteps().map((step, index) => {
                const currentIndex = getProgressSteps().indexOf(currentStep);
                const isActive = index <= currentIndex;
                const isCurrent = step === currentStep;
                return (
                  <div key={step} className="flex-1 flex items-center gap-1">
                    <div
                      className={`flex-1 h-2 rounded-full transition ${
                        isActive ? 'bg-blue-500' : 'bg-gray-200'
                      } ${isCurrent ? 'ring-2 ring-blue-300' : ''}`}
                    />
                    {index < getProgressSteps().length - 1 && (
                      <div className="w-1 h-1 bg-gray-300 rounded-full" />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex mt-2 text-xs text-gray-400">
              <span className="flex-1">Student</span>
              <span className="flex-1 text-center">Course</span>
              <span className="flex-1 text-center">Action</span>
              <span className="flex-1 text-center">Format</span>
              <span className="flex-1 text-center">
                {formData.format === 'group' ? 'Group' : 'Private'}
              </span>
              <span className="flex-1 text-right">Confirm</span>
            </div>
          </div>
        )}

        {/* Steps */}
        {currentStep === 'entry' && <BookingEntry onSelect={handleEntrySelect} />}
        
        {currentStep === 'student' && (
          <StudentSelection 
            onSelect={handleStudentSelect} 
            onBack={handleBack}
            onSkip={handleSkipInquiry}
          />
        )}
        
        {currentStep === 'context' && selectedInquiry !== null && (
          <StudentContext 
            inquiry={selectedInquiry} 
            onContinue={() => setCurrentStep('action')}
            onBack={handleBack}
            onUpdateCourse={handleCourseUpdate}
          />
        )}
        
        {currentStep === 'action' && (
          <ActionSelector 
            onSelect={handleActionSelect}
            onBack={handleBack}
          />
        )}
        
        {currentStep === 'format' && (
          <FormatSelector 
            onSelect={handleFormatSelect}
            onBack={handleBack}
          />
        )}
        
        {currentStep === 'private_form' && (
          <PrivateForm 
            data={formData}
            onChange={updateField}
            onBack={handleBack}
            onContinue={() => setCurrentStep('confirm')}
            isTrial={formData.action === 'trial'}
          />
        )}
        
        {currentStep === 'group_form' && (
          <GroupForm 
            data={formData}
            onChange={updateField}
            onBack={handleBack}
            onContinue={() => setCurrentStep('confirm')}
            isTrial={formData.action === 'trial'}
          />
        )}
        
        {currentStep === 'confirm' && (
          <Confirmation 
            data={formData}
            onBack={handleBack}
            onSubmit={handleSubmit}
          />
        )}
        
        {currentStep === 'success' && (
          <Success 
            data={formData}
            // ⭐ FIX: onDone is now properly passed
            onDone={() => {
              resetForm();
              router.push('/dashboard/classes/management');
            }}
          />
        )}
      </div>
    </div>
  );
}