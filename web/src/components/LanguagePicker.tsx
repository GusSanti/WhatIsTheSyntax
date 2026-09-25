import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

export function LanguagePicker({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const filtered = options.filter((option) =>
    option.toLowerCase().includes(value.toLowerCase().trim()),
  );
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, id]);
  const choose = (option: string) => {
    onChange(option);
    setOpen(false);
    input.current?.focus();
  };
  return (
    <div
      className="language-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Search size={18} className="input-icon" aria-hidden="true" />
      <input
        ref={input}
        id="answer"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        maxLength={160}
        placeholder="Selecione ou digite uma linguagem"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${id}-${active}` : undefined}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActive((previous) =>
              !open
                ? 0
                : Math.max(
                    0,
                    Math.min(filtered.length - 1, previous + (event.key === 'ArrowDown' ? 1 : -1)),
                  ),
            );
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
          }
          if (event.key === 'Enter' && open && filtered[active]) {
            event.preventDefault();
            choose(filtered[active]);
          }
        }}
      />
      <button
        type="button"
        className="picker-toggle"
        aria-label={open ? 'Fechar linguagens' : 'Mostrar linguagens'}
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
          input.current?.focus();
        }}
      >
        <ChevronDown size={18} />
      </button>
      {open && !disabled && (
        <ul id={`${id}-list`} role="listbox" aria-label="Linguagens" className="picker-options">
          {filtered.length ? (
            filtered.map((option, index) => (
              <li
                key={option}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? 'active' : ''}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                {option}
                {value === option && <Check size={15} />}
              </li>
            ))
          ) : (
            <li className="picker-empty" role="presentation">
              Você também pode enviar um nome ou uma abreviação.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
