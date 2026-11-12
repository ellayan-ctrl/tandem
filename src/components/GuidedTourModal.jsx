import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';

export const GuidedTourModal = ({ isOpen, onClose, onNavigateToTab, activeTab }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);

  const popoverRef = useRef(null);

  const steps = [
    {
      target: '[data-tour="transfer-mode"]',
      tab: 'send',
      badge: 'Step 1 of 6 · Routing Engine',
      title: 'Choose Transfer Mode',
      description:
        'Select "Transfer Matching (Timed)" to be paired with people sending the opposite way: whatever matches is settled locally, with no crypto conversion. Or choose "Full Crypto Transfer (Immediate)" to send the whole amount right away as USDC via Stellar Blockchain.',
      preferredPosition: 'bottom',
    },
    {
      target: '[data-tour="corridor-route"]',
      tab: 'send',
      badge: 'Step 2 of 6 · Countries',
      title: 'Countries & Amount',
      description:
        'Choose the two countries you are sending between (e.g. Canada ⇄ Kenya). Two-Way Street matches your outgoing funds against opposite-direction flows (e.g. Kenya → Canada) without cross-border banking rails.',
      preferredPosition: 'bottom',
    },
    {
      target: '[data-tour="matching-window"]',
      tab: 'send',
      badge: 'Step 3 of 6 · Time Priority',
      title: 'Matching Window & Deadline',
      description:
        'Specify how long you are willing to wait for an opposing peer (15m, 1h, 24h, or custom). While you wait, your money stays in your account; when the timer runs out, only the unmatched part is converted to USDC and sent via Stellar Blockchain.',
      preferredPosition: 'bottom',
    },
    {
      target: '[data-tour="payout-method"]',
      tab: 'send',
      badge: 'Step 4 of 6 · How You Pay',
      title: 'Choose How You Pay',
      description:
        'Choose where the matched amount comes from: your debit card, your bank account (RBC, TD, Equity…), an instant transfer like Interac, mobile money like M-Pesa, or cash at a MoneyGram agent. The partner network delivers it to the recipient however they prefer. Anything left unmatched when the window closes is sent to their Stellar wallet as USDC via Stellar Blockchain.',
      preferredPosition: 'top',
    },
    {
      target: '[data-tour="transfers-table"]',
      tab: 'dashboard',
      badge: 'Step 5 of 6 · Live Clearing',
      title: 'Live Orders & Audit Receipts',
      description:
        'Monitor active clearing queues with real-time countdown timers. Click "Audit Receipt" on any transfer to inspect Soroban smart contract verification, ledger sequence numbers, and printable audit proofs.',
      preferredPosition: 'top',
    },
    {
      target: '[data-tour="match-opportunity"]',
      tab: 'dashboard',
      badge: 'Step 6 of 6 · Matching Engine',
      title: 'Bilateral Netting & Counterparty Simulator',
      description:
        'Transfers only match when opposing flows arrive between the same two countries. Use the "+ Simulate anonymous opposing order" button here to test instant peer pairing and watch the netting engine clear opposing amounts!',
      preferredPosition: 'bottom',
    },
  ];

  const updateTargetRect = useCallback(() => {
    if (!isOpen) return;
    const current = steps[currentStep];
    if (!current) return;

    const el = document.querySelector(current.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    } else {
      setTargetRect(null);
    }
  }, [isOpen, currentStep, steps]);

  // Handle step changes, navigation, and scrolling
  useEffect(() => {
    if (!isOpen) return;
    const current = steps[currentStep];
    if (!current) return;

    if (current.tab !== activeTab) {
      onNavigateToTab(current.tab);
    }

    // Wait for tab transition and DOM mount
    const timer = setTimeout(() => {
      const el = document.querySelector(current.target);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(updateTargetRect, 250);
      } else {
        updateTargetRect();
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [currentStep, isOpen, activeTab, onNavigateToTab, updateTargetRect]);

  // Window resize & scroll listeners
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);
    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
    };
  }, [isOpen, updateTargetRect]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleComplete();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep]);

  if (!isOpen) return null;

  const current = steps[currentStep];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    try {
      localStorage.setItem('twoway_tour_seen', 'true');
    } catch {
      // ignore
    }
    onClose();
  };

  // Compute popover placement
  const popoverWidth = 360;
  let popoverTop = 100;
  let popoverLeft = 20;

  if (targetRect) {
    const pad = 12;
    // Horizontal center alignment
    const targetCenterX = targetRect.left + targetRect.width / 2;
    popoverLeft = Math.max(16, Math.min(window.innerWidth - popoverWidth - 16, targetCenterX - popoverWidth / 2));

    const preferTop = current.preferredPosition === 'top';
    const spaceBelow = window.innerHeight - (targetRect.top + targetRect.height + pad);
    const spaceAbove = targetRect.top - pad;

    if (preferTop && spaceAbove > 220) {
      popoverTop = Math.max(16, targetRect.top - 240);
    } else if (!preferTop && spaceBelow > 220) {
      popoverTop = targetRect.top + targetRect.height + pad;
    } else if (spaceBelow > 220) {
      popoverTop = targetRect.top + targetRect.height + pad;
    } else {
      popoverTop = Math.max(16, targetRect.top - 240);
    }
  } else {
    // Center if element not located
    popoverTop = window.innerHeight / 2 - 120;
    popoverLeft = window.innerWidth / 2 - popoverWidth / 2;
  }

  const padding = 8;
  const clip = targetRect
    ? {
        x: Math.max(0, targetRect.left - padding),
        y: Math.max(0, targetRect.top - padding),
        width: targetRect.width + padding * 2,
        height: targetRect.height + padding * 2,
      }
    : null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden pointer-events-auto">
      {/* SVG Spotlight Mask */}
      <svg className="fixed inset-0 w-full h-full pointer-events-none transition-all duration-300" style={{ zIndex: 51 }}>
        <defs>
          <mask id="spotlight-mask">
            {/* White background means visible */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Black rectangle cuts out the spotlight hole */}
            {clip && <rect x={clip.x} y={clip.y} width={clip.width} height={clip.height} rx="10" fill="black" />}
          </mask>
        </defs>
        {/* Dark overlay with cutout */}
        <rect x="0" y="0" width="100%" height="100%" fill="#090d16" fillOpacity="0.75" mask="url(#spotlight-mask)" />
      </svg>

      {/* Glowing / Pulsing Ring around Target */}
      {clip && (
        <div
          className="fixed rounded-xl border-2 border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.5)] transition-all duration-300 pointer-events-none animate-pulse"
          style={{
            zIndex: 52,
            top: clip.y,
            left: clip.x,
            width: clip.width,
            height: clip.height,
          }}
        />
      )}

      {/* Floating Tour Popover Box */}
      <div
        ref={popoverRef}
        className="fixed bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden transition-all duration-300 pointer-events-auto"
        style={{
          zIndex: 53,
          top: popoverTop,
          left: popoverLeft,
          width: popoverWidth,
        }}
      >
        {/* Top Header */}
        <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-emerald-800 dark:text-emerald-300">
              {current.badge}
            </span>
          </div>

          <button
            onClick={handleComplete}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            title="Skip Interactive Walkthrough"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 space-y-2">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">{current.title}</h4>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{current.description}</p>

          {/* Dots Indicator */}
          <div className="flex items-center gap-1 pt-3">
            {steps.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx)}
                className={`h-1 rounded-full transition-all ${
                  idx === currentStep ? 'w-5 bg-emerald-600 dark:bg-emerald-400' : 'w-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300'
                }`}
                title={`Jump to step ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex items-center justify-between">
          <button
            onClick={handleComplete}
            className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium transition-colors"
          >
            Skip Walkthrough
          </button>

          <div className="flex items-center gap-1.5">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="px-2.5 py-1 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Back</span>
              </button>
            )}

            <button
              onClick={handleNext}
              className="px-3.5 py-1 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded text-xs font-semibold transition-colors flex items-center gap-1 shadow-xs"
            >
              <span>{currentStep === steps.length - 1 ? 'Got it!' : 'Next'}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
