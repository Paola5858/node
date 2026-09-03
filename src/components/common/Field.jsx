import React from 'react'

function Field({ name, label, type, placeholder, options, value, error, onChange }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={name}>{label}<span>*</span></label>
      {options ? (
        <select id={name} name={name} value={value} onChange={onChange} aria-invalid={Boolean(error)}>
          <option value="">{placeholder}</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input id={name} name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} aria-invalid={Boolean(error)} />
      )}
      {error && <small className="field-error">{error}</small>}
    </div>
  )
}

export default Field
